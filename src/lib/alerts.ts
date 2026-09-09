/**
 * Predictive Alerts Rules Engine
 *
 * Pure-function library that evaluates a customer's current health snapshot
 * and history against a fixed set of business rules and returns the set of
 * currently-triggered alerts. No React, no I/O, no side effects — mirrors
 * the architecture of `src/lib/healthCalculator.ts`.
 *
 * Stateful concerns (snapshot history persistence, cooldown windows, audit
 * trail, and the Market Intelligence fetch) are owned by `src/lib/alertStore.ts`,
 * not here — this module only ever operates on data passed in.
 */

import { Customer } from '@/data/mock-customers';
import type { HealthScoreInput, RiskLevel, HealthScoreResult } from '@/lib/healthCalculator';
import type { MarketIntelligenceResponse } from '@/services/MarketIntelligenceService';

// ---------------------------------------------------------------------------
// Constants (named, exported, and reviewable — no magic numbers)
// ---------------------------------------------------------------------------

/** Priority tiers, in the fixed two-tier system described by the spec. */
export type AlertPriority = 'High' | 'Medium';

/** Cooldown window (ms) applied per rule tier to prevent repeat-triggering from flapping data. */
export const ALERT_COOLDOWN_MS: Record<AlertPriority, number> = {
  High: 24 * 60 * 60 * 1000, // 24h
  Medium: 72 * 60 * 60 * 1000, // 72h
};

/** Business thresholds referenced by the rule functions below. */
export const ALERT_THRESHOLDS = {
  /** Payment Risk: days since last payment beyond which payment is considered overdue. */
  paymentOverdueDays: 30,
  /** Payment Risk: health-score-drop window and magnitude. */
  healthDropWindowDays: 7,
  healthDropPoints: 20,
  /** Engagement Cliff: login-frequency drop vs. 30-day rolling average. */
  loginDropPct: 0.5,
  /** Contract Expiration Risk. */
  contractExpirationDays: 90,
  contractExpirationHealthScore: 50,
  /** Support Ticket Spike. */
  supportTicketWindowDays: 7,
  supportTicketCount: 3,
  /** Feature Adoption Stall. */
  featureAdoptionWindowDays: 30,
  /** Market Sentiment. */
  sentimentConfidenceThreshold: 0.6,
  sentimentEscalationHealthScore: 50,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Recorded each time `calculateHealthScore` runs for a customer. */
export interface CustomerHealthSnapshot {
  customerId: string;
  /** ISO timestamp of when this snapshot was recorded. */
  timestamp: string;
  overallScore: number;
  riskLevel: RiskLevel;
  breakdown: HealthScoreResult['breakdown'];
  /** Raw factor inputs used to produce this snapshot, for trend rules. */
  rawInputs: HealthScoreInput;
}

/** A supporting headline attached to sentiment-driven alerts (subset of `MockHeadline`). */
export interface AlertSupportingHeadline {
  title: string;
  source: string;
  publishedAt: string;
}

/** A single triggered alert. */
export interface Alert {
  id: string;
  customerId: string;
  /** Stable rule identifier, e.g. 'payment-risk'. Used for dedup/cooldown keying. */
  ruleId: string;
  priority: AlertPriority;
  /** Short human-readable alert type/title. */
  title: string;
  /** Plain-language description of the triggering condition. */
  message: string;
  /** Recommended next action for the customer success manager. */
  recommendedAction: string;
  /** ISO timestamp of when this alert was triggered. */
  triggeredAt: string;
  /** Ranking inputs, kept for prioritization/sorting (not rendered directly). */
  customerValue: number;
  /** Up to 3 supporting headlines for market-sentiment-driven alerts. */
  supportingHeadlines?: AlertSupportingHeadline[];
}

/** Metadata describing a rule, used by `alertStore.ts` for cooldown bookkeeping. */
export interface AlertRule {
  id: string;
  priority: AlertPriority;
  cooldownMs: number;
}

export interface EvaluateAlertsOptions {
  /** Current market intelligence reading for `customer.company`, if available. */
  marketData?: MarketIntelligenceResponse;
  /** The immediately-prior market intelligence reading, for sustained-trend detection. */
  priorMarketData?: MarketIntelligenceResponse;
  /** Injectable clock for deterministic unit tests; defaults to `Date.now()`. */
  now?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when required alert-evaluation inputs are missing or malformed. */
export class AlertValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlertValidationError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertCustomer(customer: Customer): void {
  if (!customer || typeof customer !== 'object' || !customer.id) {
    throw new AlertValidationError('A valid customer with an id is required.');
  }
}

function assertSnapshot(snapshot: CustomerHealthSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new AlertValidationError('A current health snapshot is required.');
  }
  if (typeof snapshot.overallScore !== 'number' || Number.isNaN(snapshot.overallScore)) {
    throw new AlertValidationError('Snapshot overallScore must be a number.');
  }
}

function daysAgo(fromMs: number, isoTimestamp: string): number {
  return (fromMs - new Date(isoTimestamp).getTime()) / MS_PER_DAY;
}

function snapshotAtLeastDaysAgo(
  history: CustomerHealthSnapshot[],
  nowMs: number,
  minDaysAgo: number
): CustomerHealthSnapshot | null {
  // History is expected oldest-to-newest; find the most recent snapshot that
  // is at least `minDaysAgo` old, so we compare like-for-like windows.
  for (let i = history.length - 1; i >= 0; i--) {
    if (daysAgo(nowMs, history[i].timestamp) >= minDaysAgo) {
      return history[i];
    }
  }
  return null;
}

function snapshotsWithinDays(
  history: CustomerHealthSnapshot[],
  nowMs: number,
  maxDaysAgo: number
): CustomerHealthSnapshot[] {
  return history.filter((s) => daysAgo(nowMs, s.timestamp) <= maxDaysAgo);
}

function isGrowingAccount(customer: Customer): boolean {
  return (
    customer.contract?.recentUpgrade === true ||
    customer.subscriptionTier === 'premium' ||
    customer.subscriptionTier === 'enterprise'
  );
}

function makeAlert(params: Omit<Alert, 'id'>): Alert {
  return { id: `${params.customerId}:${params.ruleId}:${params.triggeredAt}`, ...params };
}

// ---------------------------------------------------------------------------
// Rule functions — each independent, pure, and unit-testable in isolation
// ---------------------------------------------------------------------------

/**
 * High Priority — Payment Risk.
 * Triggers when payment is overdue beyond the documented threshold (a
 * concrete non-payment signal) OR when the health score has dropped more
 * than 20 points within the last 7 days (a fast-moving composite signal
 * that often reflects an emerging payment/support problem before it shows
 * up as a raw overdue balance).
 */
export function checkPaymentRiskAlert(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  history: CustomerHealthSnapshot[],
  now: number = Date.now()
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  const daysSinceLastPayment = customer.paymentHistory?.daysSinceLastPayment ?? 0;
  const overdue = daysSinceLastPayment > ALERT_THRESHOLDS.paymentOverdueDays;

  const priorSnapshot = snapshotAtLeastDaysAgo(history, now, ALERT_THRESHOLDS.healthDropWindowDays);
  const scoreDrop = priorSnapshot ? priorSnapshot.overallScore - currentSnapshot.overallScore : 0;
  const droppedFast = scoreDrop > ALERT_THRESHOLDS.healthDropPoints;

  if (!overdue && !droppedFast) return null;

  const message = overdue
    ? `Payment overdue ${Math.round(daysSinceLastPayment)} days.`
    : `Health score dropped ${Math.round(scoreDrop)} points in the last ${ALERT_THRESHOLDS.healthDropWindowDays} days.`;

  return makeAlert({
    customerId: customer.id,
    ruleId: 'payment-risk',
    priority: 'High',
    title: 'Payment Risk',
    message,
    recommendedAction: 'Contact customer to confirm payment status and resolve any billing issues.',
    triggeredAt: new Date(now).toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
  });
}

/**
 * High Priority — Engagement Cliff.
 * Triggers when login frequency drops more than 50% vs. the customer's
 * 30-day rolling average — a sudden disengagement signal that often
 * precedes churn well before contract renewal or payment issues appear.
 */
export function checkEngagementCliffAlert(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  history: CustomerHealthSnapshot[],
  now: number = Date.now()
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  const currentLogins = customer.engagement?.loginFrequencyPerWeek ?? 0;
  const windowSnapshots = snapshotsWithinDays(history, now, 30);
  if (windowSnapshots.length === 0) return null;

  const avgLogins =
    windowSnapshots.reduce((sum, s) => sum + (s.rawInputs.engagement?.loginFrequencyPerWeek ?? 0), 0) /
    windowSnapshots.length;

  if (avgLogins <= 0) return null;

  const dropPct = (avgLogins - currentLogins) / avgLogins;
  if (dropPct <= ALERT_THRESHOLDS.loginDropPct) return null;

  return makeAlert({
    customerId: customer.id,
    ruleId: 'engagement-cliff',
    priority: 'High',
    title: 'Engagement Cliff',
    message: `Login frequency dropped ${Math.round(dropPct * 100)}% vs. the 30-day average.`,
    recommendedAction: 'Reach out proactively to re-engage the customer and identify blockers.',
    triggeredAt: new Date(now).toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
  });
}

/**
 * High Priority — Contract Expiration Risk.
 * Triggers when a renewal is approaching (<90 days out) while the
 * customer's overall health score is already low (<50) — the combination
 * of imminent renewal decision + weak health is the highest-leverage
 * moment to intervene before a churn decision is finalized.
 */
export function checkContractExpirationRisk(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  now: number = Date.now()
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  const daysUntilRenewal = customer.contract?.daysUntilRenewal;
  if (daysUntilRenewal === undefined) return null;

  const atRisk =
    daysUntilRenewal < ALERT_THRESHOLDS.contractExpirationDays &&
    currentSnapshot.overallScore < ALERT_THRESHOLDS.contractExpirationHealthScore;

  if (!atRisk) return null;

  return makeAlert({
    customerId: customer.id,
    ruleId: 'contract-expiration-risk',
    priority: 'High',
    title: 'Contract Expiration Risk',
    message: `Contract renews in ${Math.round(daysUntilRenewal)} days with a health score of ${currentSnapshot.overallScore}.`,
    recommendedAction: 'Schedule a renewal/success review before the contract expires.',
    triggeredAt: new Date(now).toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
  });
}

/**
 * Medium Priority — Support Ticket Spike.
 * Triggers on high recent ticket volume (>3 in 7 days) OR any escalated
 * ticket — escalations are treated as an unconditional trigger since a
 * single escalation can indicate a severe, high-churn-risk experience
 * regardless of overall volume.
 */
export function checkSupportTicketSpike(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  const ticketCount = customer.engagement?.supportTicketCount ?? 0;
  const escalationCount = customer.support?.escalationCount ?? 0;
  const spiked = ticketCount > ALERT_THRESHOLDS.supportTicketCount;
  const escalated = escalationCount > 0;

  if (!spiked && !escalated) return null;

  const message = escalated
    ? `${escalationCount} escalated support ticket${escalationCount === 1 ? '' : 's'} in the recent period.`
    : `${ticketCount} support tickets filed in the last ${ALERT_THRESHOLDS.supportTicketWindowDays} days.`;

  return makeAlert({
    customerId: customer.id,
    ruleId: 'support-ticket-spike',
    priority: 'Medium',
    title: 'Support Ticket Spike',
    message,
    recommendedAction: 'Review open tickets with the support team and prioritize resolution.',
    triggeredAt: new Date().toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
  });
}

/**
 * Medium Priority — Feature Adoption Stall.
 * Triggers only for "growing" accounts (recent upgrade or premium/enterprise
 * tier) that show no growth in feature usage over the last 30 days —
 * stalled adoption on an account expected to be expanding is an early
 * expansion-risk signal, not just a general engagement concern.
 */
export function checkFeatureAdoptionStall(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  history: CustomerHealthSnapshot[],
  now: number = Date.now()
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  if (!isGrowingAccount(customer)) return null;

  const baseline = snapshotAtLeastDaysAgo(history, now, ALERT_THRESHOLDS.featureAdoptionWindowDays);
  if (!baseline) return null;

  const currentUsage = customer.engagement?.featureUsageCount ?? 0;
  const baselineUsage = baseline.rawInputs.engagement?.featureUsageCount ?? 0;

  if (currentUsage > baselineUsage) return null; // adoption growing, no stall

  return makeAlert({
    customerId: customer.id,
    ruleId: 'feature-adoption-stall',
    priority: 'Medium',
    title: 'Feature Adoption Stall',
    message: `No new feature adoption in the last ${ALERT_THRESHOLDS.featureAdoptionWindowDays} days for a growing account.`,
    recommendedAction: 'Offer a feature-adoption walkthrough or onboarding session for unused capabilities.',
    triggeredAt: new Date(now).toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
  });
}

/**
 * Medium Priority (escalates to High) — Negative Market Sentiment Alert.
 * Triggers only when negative sentiment (confidence above threshold) is
 * sustained across two consecutive market intelligence readings, avoiding
 * reaction to a single noisy headline. When combined with an existing
 * internal risk signal (health score <50), external and internal risk are
 * compounding, so the alert is promoted to High Priority.
 *
 * Remains pure: operates only on already-fetched `MarketIntelligenceResponse`
 * data plus the customer's health snapshot — no I/O.
 */
export function checkMarketSentimentRisk(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  marketData?: MarketIntelligenceResponse,
  priorMarketData?: MarketIntelligenceResponse,
  now: number = Date.now()
): Alert | null {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  if (!marketData || !priorMarketData) return null;

  const isNegative = (data: MarketIntelligenceResponse) =>
    data.sentiment.label === 'negative' &&
    data.sentiment.confidence > ALERT_THRESHOLDS.sentimentConfidenceThreshold;

  const sustained = isNegative(marketData) && isNegative(priorMarketData);
  if (!sustained) return null;

  const escalate = currentSnapshot.overallScore < ALERT_THRESHOLDS.sentimentEscalationHealthScore;

  const supportingHeadlines: AlertSupportingHeadline[] = marketData.headlines.slice(0, 3).map((h) => ({
    title: h.title,
    source: h.source,
    publishedAt: h.publishedAt,
  }));

  return makeAlert({
    customerId: customer.id,
    ruleId: 'market-sentiment-negative',
    priority: escalate ? 'High' : 'Medium',
    title: escalate ? 'Negative Market Sentiment (Escalated)' : 'Negative Market Sentiment',
    message: escalate
      ? `Sustained negative market sentiment combined with a low health score (${currentSnapshot.overallScore}).`
      : 'Sustained negative market sentiment detected across consecutive readings.',
    recommendedAction: escalate
      ? 'Urgent: review external coverage and internal health signals together before next contact.'
      : 'Monitor external coverage; no immediate internal risk detected yet.',
    triggeredAt: new Date(now).toISOString(),
    customerValue: customer.contract?.contractValue ?? 0,
    supportingHeadlines,
  });
}

// ---------------------------------------------------------------------------
// Rule registry + prioritization
// ---------------------------------------------------------------------------

export const ALERT_RULES: AlertRule[] = [
  { id: 'payment-risk', priority: 'High', cooldownMs: ALERT_COOLDOWN_MS.High },
  { id: 'engagement-cliff', priority: 'High', cooldownMs: ALERT_COOLDOWN_MS.High },
  { id: 'contract-expiration-risk', priority: 'High', cooldownMs: ALERT_COOLDOWN_MS.High },
  { id: 'support-ticket-spike', priority: 'Medium', cooldownMs: ALERT_COOLDOWN_MS.Medium },
  { id: 'feature-adoption-stall', priority: 'Medium', cooldownMs: ALERT_COOLDOWN_MS.Medium },
  { id: 'market-sentiment-negative', priority: 'Medium', cooldownMs: ALERT_COOLDOWN_MS.Medium },
];

const PRIORITY_RANK: Record<AlertPriority, number> = { High: 0, Medium: 1 };

/** Ranks alerts by priority tier, then customer value, then recency (most recent first). */
function prioritizeAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    if (b.customerValue !== a.customerValue) {
      return b.customerValue - a.customerValue;
    }
    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Evaluates all rules against a customer's current snapshot + history and
 * returns the prioritized, deduplicated set of currently-triggered alerts
 * (at most one alert per rule, since each rule function is itself a single
 * pass/fail check). Market-data-driven rules are skipped gracefully when
 * market data is absent, so existing five-rule behavior is unaffected.
 *
 * Cooldown filtering against previously-triggered alerts is NOT performed
 * here — that stateful concern is owned by `alertStore.ts`, which calls this
 * function and then filters by its own cooldown bookkeeping.
 */
export function evaluateAlerts(
  customer: Customer,
  currentSnapshot: CustomerHealthSnapshot,
  history: CustomerHealthSnapshot[] = [],
  options: EvaluateAlertsOptions = {}
): Alert[] {
  assertCustomer(customer);
  assertSnapshot(currentSnapshot);

  const now = options.now ?? Date.now();

  const alerts = [
    checkPaymentRiskAlert(customer, currentSnapshot, history, now),
    checkEngagementCliffAlert(customer, currentSnapshot, history, now),
    checkContractExpirationRisk(customer, currentSnapshot, now),
    checkSupportTicketSpike(customer, currentSnapshot),
    checkFeatureAdoptionStall(customer, currentSnapshot, history, now),
    checkMarketSentimentRisk(customer, currentSnapshot, options.marketData, options.priorMarketData, now),
  ].filter((a): a is Alert => a !== null);

  return prioritizeAlerts(alerts);
}
