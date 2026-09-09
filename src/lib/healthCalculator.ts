/**
 * Health Score Calculator
 *
 * Pure-function library for computing a customer's health score for the
 * Customer Intelligence Dashboard. No React, no I/O, no side effects —
 * every function here is deterministic and safe to unit test in isolation.
 *
 * Business rationale
 * -------------------
 * A customer's overall health is a weighted blend of four signals, each
 * normalized to a 0-100 sub-score before weighting so that inputs with very
 * different units (days, dollars, counts) can be combined meaningfully:
 *
 *   - Payment history (40%): the strongest predictor of churn. Customers
 *     who pay late or carry overdue balances are the highest-risk segment,
 *     so this factor carries the most weight.
 *   - Engagement (30%): active product usage predicts renewal. Customers
 *     who rarely log in or use few features are disengaging even if their
 *     payments are current.
 *   - Contract status (20%): time-to-renewal and recent upgrades are
 *     leading indicators of commitment, but lag behind payment/engagement
 *     signals in predictive power.
 *   - Support satisfaction (10%): a meaningful but noisier signal — a
 *     single bad ticket shouldn't dominate the overall score.
 */

// ---------------------------------------------------------------------------
// Constants (named, exported, and reviewable — no magic numbers)
// ---------------------------------------------------------------------------

/** Weight applied to each factor's normalized sub-score when combining into the overall score. */
export const HEALTH_SCORE_WEIGHTS = {
  payment: 0.4,
  engagement: 0.3,
  contract: 0.2,
  support: 0.1,
} as const;

/** Inclusive upper bound (score <= value) for each risk classification band. */
export const RISK_LEVEL_THRESHOLDS = {
  critical: 30,
  warning: 70,
  // healthy: anything above `warning`, up to 100
} as const;

/** Neutral default sub-score (out of 100) used for new customers with insufficient history. */
export const NEUTRAL_DEFAULT_SUBSCORE = 50;

/** Normalization reference points for the payment factor. */
export const PAYMENT_NORMALIZATION = {
  /** Days since last payment beyond which the recency component bottoms out at 0. */
  maxDaysSinceLastPayment: 90,
  /** Average payment delay (days) beyond which the delay component bottoms out at 0. */
  maxAvgPaymentDelayDays: 60,
  /** Overdue amount ($) beyond which the overdue component bottoms out at 0. */
  maxOverdueAmount: 5000,
} as const;

/** Normalization reference points for the engagement factor. */
export const ENGAGEMENT_NORMALIZATION = {
  /** Logins/week at or above which the login component maxes out at 100. */
  targetLoginsPerWeek: 5,
  /** Feature usage count at or above which the usage component maxes out at 100. */
  targetFeatureUsageCount: 20,
  /** Support ticket count at or above which the ticket-volume component bottoms out at 0. */
  maxSupportTicketCount: 10,
} as const;

/** Normalization reference points for the contract factor. */
export const CONTRACT_NORMALIZATION = {
  /** Days until renewal at or beyond which the renewal-horizon component maxes out at 100. */
  targetDaysUntilRenewal: 180,
  /** Contract value ($) at or beyond which the value component maxes out at 100. */
  targetContractValue: 100_000,
  /** Bonus points added when a recent upgrade occurred (capped at 100). */
  recentUpgradeBonus: 20,
} as const;

/** Normalization reference points for the support factor. */
export const SUPPORT_NORMALIZATION = {
  /** Average resolution time (hours) beyond which the resolution component bottoms out at 0. */
  maxAvgResolutionTimeHours: 72,
  /** Satisfaction score is expected on a 0-10 scale; scaled to 0-100. */
  maxSatisfactionScore: 10,
  /** Escalation count at or beyond which the escalation component bottoms out at 0. */
  maxEscalationCount: 5,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'Healthy' | 'Warning' | 'Critical';

/** Payment history inputs. All fields required unless the customer has no payment history yet. */
export interface PaymentHistoryInput {
  /** Days since the customer's last payment. */
  daysSinceLastPayment?: number;
  /** Average delay (days) between due date and payment date, historically. */
  avgPaymentDelayDays?: number;
  /** Total currently overdue amount, in dollars. */
  overdueAmount?: number;
  /** True when the customer has no payment history yet (e.g. brand new account). */
  hasNoPaymentHistory?: boolean;
}

/** Engagement metrics inputs. */
export interface EngagementInput {
  /** Average logins per week. */
  loginFrequencyPerWeek?: number;
  /** Count of distinct features used. */
  featureUsageCount?: number;
  /** Count of support tickets filed (higher can indicate friction). */
  supportTicketCount?: number;
}

/** Contract information inputs. */
export interface ContractInput {
  /** Days remaining until contract renewal. */
  daysUntilRenewal?: number;
  /** Total contract value, in dollars. */
  contractValue?: number;
  /** Whether the customer recently upgraded their plan/contract. */
  recentUpgrade?: boolean;
}

/** Support/satisfaction data inputs. */
export interface SupportInput {
  /** Average ticket resolution time, in hours. */
  avgResolutionTimeHours?: number;
  /** Satisfaction score on a 0-10 scale. */
  satisfactionScore?: number;
  /** Count of escalated support tickets. */
  escalationCount?: number;
  /** True when the customer has no support history yet. */
  hasNoSupportHistory?: boolean;
}

/** Full set of inputs required to calculate an overall health score. */
export interface HealthScoreInput {
  payment: PaymentHistoryInput;
  engagement: EngagementInput;
  contract: ContractInput;
  support: SupportInput;
}

/** Explains how one factor contributed to the overall score. */
export interface FactorBreakdown {
  /** Human-readable factor name, e.g. "Payment History". */
  label: string;
  /** Raw inputs used to compute this factor, for explainability/debugging. */
  rawInputs: Record<string, unknown>;
  /** Normalized sub-score, 0-100. */
  normalizedScore: number;
  /** Weight applied to this factor (0-1). */
  weight: number;
  /** normalizedScore * weight — this factor's contribution to the overall score. */
  weightedContribution: number;
  /** True when a documented default was used due to missing/insufficient history. */
  usedDefault: boolean;
}

/** Full result returned by `calculateHealthScore`. */
export interface HealthScoreResult {
  /** Overall health score, 0-100. */
  overallScore: number;
  /** Risk classification derived from `overallScore`. */
  riskLevel: RiskLevel;
  /** Per-factor breakdown, in payment/engagement/contract/support order. */
  breakdown: {
    payment: FactorBreakdown;
    engagement: FactorBreakdown;
    contract: FactorBreakdown;
    support: FactorBreakdown;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when required health-score inputs are missing, malformed, or out
 * of the documented valid range. Distinguishes user/data errors from bugs.
 */
export class HealthScoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthScoreValidationError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linearly scales `value` from [0, max] to [0, 100], clamped, where higher raw value = higher score. */
function scaleUp(value: number, max: number): number {
  if (max <= 0) return 0;
  return clamp((value / max) * 100, 0, 100);
}

/** Linearly scales `value` from [0, max] to [100, 0], clamped, where higher raw value = lower score. */
function scaleDown(value: number, max: number): number {
  if (max <= 0) return 0;
  return clamp(100 - (value / max) * 100, 0, 100);
}

function assertFiniteNonNegative(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HealthScoreValidationError(
      `${fieldName} must be a finite number, received: ${JSON.stringify(value)}`
    );
  }
  if (value < 0) {
    throw new HealthScoreValidationError(
      `${fieldName} must be >= 0, received: ${value}`
    );
  }
}

// ---------------------------------------------------------------------------
// Factor scoring functions
// ---------------------------------------------------------------------------

/**
 * Scores payment reliability, 0-100. Higher is healthier.
 *
 * New customers with no payment history yet (`hasNoPaymentHistory: true`)
 * receive the documented neutral default rather than an error or a
 * misleadingly perfect/zero score — we simply don't have signal yet.
 */
export function calculatePaymentScore(input: PaymentHistoryInput): {
  score: number;
  usedDefault: boolean;
} {
  if (!input || typeof input !== 'object') {
    throw new HealthScoreValidationError('Payment history input is required.');
  }

  if (input.hasNoPaymentHistory) {
    return { score: NEUTRAL_DEFAULT_SUBSCORE, usedDefault: true };
  }

  const { daysSinceLastPayment, avgPaymentDelayDays, overdueAmount } = input;

  if (
    daysSinceLastPayment === undefined ||
    avgPaymentDelayDays === undefined ||
    overdueAmount === undefined
  ) {
    throw new HealthScoreValidationError(
      'Payment history requires daysSinceLastPayment, avgPaymentDelayDays, and overdueAmount ' +
        '(or set hasNoPaymentHistory: true for new customers).'
    );
  }

  assertFiniteNonNegative(daysSinceLastPayment, 'payment.daysSinceLastPayment');
  assertFiniteNonNegative(avgPaymentDelayDays, 'payment.avgPaymentDelayDays');
  assertFiniteNonNegative(overdueAmount, 'payment.overdueAmount');

  const recencyScore = scaleDown(daysSinceLastPayment, PAYMENT_NORMALIZATION.maxDaysSinceLastPayment);
  const delayScore = scaleDown(avgPaymentDelayDays, PAYMENT_NORMALIZATION.maxAvgPaymentDelayDays);
  const overdueScore = scaleDown(overdueAmount, PAYMENT_NORMALIZATION.maxOverdueAmount);

  const score = (recencyScore + delayScore + overdueScore) / 3;
  return { score: clamp(score, 0, 100), usedDefault: false };
}

/**
 * Scores product engagement, 0-100. Higher is healthier.
 * Support ticket count is treated as a mild negative signal (friction),
 * not a proxy for engagement itself.
 */
export function calculateEngagementScore(input: EngagementInput): {
  score: number;
  usedDefault: boolean;
} {
  if (!input || typeof input !== 'object') {
    throw new HealthScoreValidationError('Engagement input is required.');
  }

  const { loginFrequencyPerWeek, featureUsageCount, supportTicketCount } = input;

  if (loginFrequencyPerWeek === undefined || featureUsageCount === undefined) {
    throw new HealthScoreValidationError(
      'Engagement requires loginFrequencyPerWeek and featureUsageCount.'
    );
  }

  assertFiniteNonNegative(loginFrequencyPerWeek, 'engagement.loginFrequencyPerWeek');
  assertFiniteNonNegative(featureUsageCount, 'engagement.featureUsageCount');

  const tickets = supportTicketCount ?? 0;
  assertFiniteNonNegative(tickets, 'engagement.supportTicketCount');

  const loginScore = scaleUp(loginFrequencyPerWeek, ENGAGEMENT_NORMALIZATION.targetLoginsPerWeek);
  const usageScore = scaleUp(featureUsageCount, ENGAGEMENT_NORMALIZATION.targetFeatureUsageCount);
  const ticketPenaltyScore = scaleDown(tickets, ENGAGEMENT_NORMALIZATION.maxSupportTicketCount);

  const score = loginScore * 0.5 + usageScore * 0.3 + ticketPenaltyScore * 0.2;
  return { score: clamp(score, 0, 100), usedDefault: false };
}

/**
 * Scores contract standing, 0-100. Higher is healthier.
 * A recent upgrade is treated as a positive bonus signal on top of the
 * renewal-horizon and value components.
 */
export function calculateContractScore(input: ContractInput): {
  score: number;
  usedDefault: boolean;
} {
  if (!input || typeof input !== 'object') {
    throw new HealthScoreValidationError('Contract input is required.');
  }

  const { daysUntilRenewal, contractValue, recentUpgrade } = input;

  if (daysUntilRenewal === undefined || contractValue === undefined) {
    throw new HealthScoreValidationError(
      'Contract info requires daysUntilRenewal and contractValue.'
    );
  }

  assertFiniteNonNegative(daysUntilRenewal, 'contract.daysUntilRenewal');
  assertFiniteNonNegative(contractValue, 'contract.contractValue');

  const renewalScore = scaleUp(daysUntilRenewal, CONTRACT_NORMALIZATION.targetDaysUntilRenewal);
  const valueScore = scaleUp(contractValue, CONTRACT_NORMALIZATION.targetContractValue);
  const bonus = recentUpgrade ? CONTRACT_NORMALIZATION.recentUpgradeBonus : 0;

  const score = clamp(renewalScore * 0.6 + valueScore * 0.4 + bonus, 0, 100);
  return { score, usedDefault: false };
}

/**
 * Scores support satisfaction, 0-100. Higher is healthier.
 *
 * New customers with no support history yet (`hasNoSupportHistory: true`)
 * receive the documented neutral default — no tickets filed is not
 * evidence of either satisfaction or dissatisfaction.
 */
export function calculateSupportScore(input: SupportInput): {
  score: number;
  usedDefault: boolean;
} {
  if (!input || typeof input !== 'object') {
    throw new HealthScoreValidationError('Support input is required.');
  }

  if (input.hasNoSupportHistory) {
    return { score: NEUTRAL_DEFAULT_SUBSCORE, usedDefault: true };
  }

  const { avgResolutionTimeHours, satisfactionScore, escalationCount } = input;

  if (
    avgResolutionTimeHours === undefined ||
    satisfactionScore === undefined ||
    escalationCount === undefined
  ) {
    throw new HealthScoreValidationError(
      'Support data requires avgResolutionTimeHours, satisfactionScore, and escalationCount ' +
        '(or set hasNoSupportHistory: true for new customers).'
    );
  }

  assertFiniteNonNegative(avgResolutionTimeHours, 'support.avgResolutionTimeHours');
  assertFiniteNonNegative(satisfactionScore, 'support.satisfactionScore');
  assertFiniteNonNegative(escalationCount, 'support.escalationCount');

  if (satisfactionScore > SUPPORT_NORMALIZATION.maxSatisfactionScore) {
    throw new HealthScoreValidationError(
      `support.satisfactionScore must be between 0 and ${SUPPORT_NORMALIZATION.maxSatisfactionScore}, received: ${satisfactionScore}`
    );
  }

  const resolutionScore = scaleDown(
    avgResolutionTimeHours,
    SUPPORT_NORMALIZATION.maxAvgResolutionTimeHours
  );
  const satisfactionPct = scaleUp(satisfactionScore, SUPPORT_NORMALIZATION.maxSatisfactionScore);
  const escalationScore = scaleDown(escalationCount, SUPPORT_NORMALIZATION.maxEscalationCount);

  const score = resolutionScore * 0.3 + satisfactionPct * 0.5 + escalationScore * 0.2;
  return { score: clamp(score, 0, 100), usedDefault: false };
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

/** Classifies a 0-100 overall score into a risk level per the documented bands. */
export function classifyRiskLevel(overallScore: number): RiskLevel {
  if (overallScore <= RISK_LEVEL_THRESHOLDS.critical) return 'Critical';
  if (overallScore <= RISK_LEVEL_THRESHOLDS.warning) return 'Warning';
  return 'Healthy';
}

// ---------------------------------------------------------------------------
// Overall calculation
// ---------------------------------------------------------------------------

/**
 * Combines the four factor scores into an overall health score using the
 * documented weights, and classifies the result into a risk level.
 *
 * @throws {HealthScoreValidationError} if any required input is missing or malformed.
 */
export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  if (!input || typeof input !== 'object') {
    throw new HealthScoreValidationError('Health score input is required.');
  }

  const payment = calculatePaymentScore(input.payment);
  const engagement = calculateEngagementScore(input.engagement);
  const contract = calculateContractScore(input.contract);
  const support = calculateSupportScore(input.support);

  const paymentContribution = payment.score * HEALTH_SCORE_WEIGHTS.payment;
  const engagementContribution = engagement.score * HEALTH_SCORE_WEIGHTS.engagement;
  const contractContribution = contract.score * HEALTH_SCORE_WEIGHTS.contract;
  const supportContribution = support.score * HEALTH_SCORE_WEIGHTS.support;

  const overallScore = clamp(
    Math.round(
      paymentContribution + engagementContribution + contractContribution + supportContribution
    ),
    0,
    100
  );

  return {
    overallScore,
    riskLevel: classifyRiskLevel(overallScore),
    breakdown: {
      payment: {
        label: 'Payment History',
        rawInputs: { ...input.payment },
        normalizedScore: Math.round(payment.score),
        weight: HEALTH_SCORE_WEIGHTS.payment,
        weightedContribution: Math.round(paymentContribution),
        usedDefault: payment.usedDefault,
      },
      engagement: {
        label: 'Engagement',
        rawInputs: { ...input.engagement },
        normalizedScore: Math.round(engagement.score),
        weight: HEALTH_SCORE_WEIGHTS.engagement,
        weightedContribution: Math.round(engagementContribution),
        usedDefault: engagement.usedDefault,
      },
      contract: {
        label: 'Contract Status',
        rawInputs: { ...input.contract },
        normalizedScore: Math.round(contract.score),
        weight: HEALTH_SCORE_WEIGHTS.contract,
        weightedContribution: Math.round(contractContribution),
        usedDefault: contract.usedDefault,
      },
      support: {
        label: 'Support Satisfaction',
        rawInputs: { ...input.support },
        normalizedScore: Math.round(support.score),
        weight: HEALTH_SCORE_WEIGHTS.support,
        weightedContribution: Math.round(supportContribution),
        usedDefault: support.usedDefault,
      },
    },
  };
}
