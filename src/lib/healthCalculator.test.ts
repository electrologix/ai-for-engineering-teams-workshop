/**
 * Unit tests for healthCalculator.ts
 *
 * Run with: npx tsx src/lib/healthCalculator.test.ts
 * (No test framework is configured in this project yet; this is a
 * lightweight, dependency-free assertion script covering the acceptance
 * criteria: boundary conditions, realistic scenarios, and invalid input.)
 */

import {
  calculateHealthScore,
  calculatePaymentScore,
  calculateEngagementScore,
  calculateContractScore,
  calculateSupportScore,
  classifyRiskLevel,
  HealthScoreValidationError,
  HealthScoreInput,
} from './healthCalculator';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

function assertThrows(fn: () => void, errorType: new (...args: never[]) => Error, message: string) {
  try {
    fn();
    assert(false, `${message} (expected throw, none occurred)`);
  } catch (err) {
    assert(err instanceof errorType, `${message} (expected ${errorType.name}, got ${(err as Error).name})`);
  }
}

// ---------------------------------------------------------------------------
// Risk level boundary conditions
// ---------------------------------------------------------------------------

assertEqual(classifyRiskLevel(30), 'Critical', 'score 30 is Critical');
assertEqual(classifyRiskLevel(31), 'Warning', 'score 31 is Warning');
assertEqual(classifyRiskLevel(70), 'Warning', 'score 70 is Warning');
assertEqual(classifyRiskLevel(71), 'Healthy', 'score 71 is Healthy');
assertEqual(classifyRiskLevel(0), 'Critical', 'score 0 is Critical');
assertEqual(classifyRiskLevel(100), 'Healthy', 'score 100 is Healthy');

// ---------------------------------------------------------------------------
// Factor functions: independently exported and unit-testable
// ---------------------------------------------------------------------------

const perfectPayment = calculatePaymentScore({
  daysSinceLastPayment: 0,
  avgPaymentDelayDays: 0,
  overdueAmount: 0,
});
assertEqual(perfectPayment.score, 100, 'perfect payment history scores 100');

const worstPayment = calculatePaymentScore({
  daysSinceLastPayment: 90,
  avgPaymentDelayDays: 60,
  overdueAmount: 5000,
});
assertEqual(worstPayment.score, 0, 'worst-case payment history scores 0');

const perfectEngagement = calculateEngagementScore({
  loginFrequencyPerWeek: 5,
  featureUsageCount: 20,
  supportTicketCount: 0,
});
assertEqual(perfectEngagement.score, 100, 'max engagement inputs score 100');

const perfectContract = calculateContractScore({
  daysUntilRenewal: 180,
  contractValue: 100_000,
  recentUpgrade: false,
});
assertEqual(perfectContract.score, 100, 'max contract inputs (no upgrade) score 100');

const perfectSupport = calculateSupportScore({
  avgResolutionTimeHours: 0,
  satisfactionScore: 10,
  escalationCount: 0,
});
assertEqual(perfectSupport.score, 100, 'perfect support inputs score 100');

// ---------------------------------------------------------------------------
// Weighted combination
// ---------------------------------------------------------------------------

const perfectInput: HealthScoreInput = {
  payment: { daysSinceLastPayment: 0, avgPaymentDelayDays: 0, overdueAmount: 0 },
  engagement: { loginFrequencyPerWeek: 5, featureUsageCount: 20, supportTicketCount: 0 },
  contract: { daysUntilRenewal: 180, contractValue: 100_000, recentUpgrade: false },
  support: { avgResolutionTimeHours: 0, satisfactionScore: 10, escalationCount: 0 },
};
const perfectResult = calculateHealthScore(perfectInput);
assertEqual(perfectResult.overallScore, 100, 'all-perfect inputs yield overall score 100');
assertEqual(perfectResult.riskLevel, 'Healthy', 'all-perfect inputs classify as Healthy');
assertEqual(perfectResult.breakdown.payment.weight, 0.4, 'payment weight is 40%');
assertEqual(perfectResult.breakdown.engagement.weight, 0.3, 'engagement weight is 30%');
assertEqual(perfectResult.breakdown.contract.weight, 0.2, 'contract weight is 20%');
assertEqual(perfectResult.breakdown.support.weight, 0.1, 'support weight is 10%');

const worstInput: HealthScoreInput = {
  payment: { daysSinceLastPayment: 90, avgPaymentDelayDays: 60, overdueAmount: 5000 },
  engagement: { loginFrequencyPerWeek: 0, featureUsageCount: 0, supportTicketCount: 10 },
  contract: { daysUntilRenewal: 0, contractValue: 0, recentUpgrade: false },
  support: { avgResolutionTimeHours: 72, satisfactionScore: 0, escalationCount: 5 },
};
const worstResult = calculateHealthScore(worstInput);
assertEqual(worstResult.overallScore, 0, 'all-worst inputs yield overall score 0');
assertEqual(worstResult.riskLevel, 'Critical', 'all-worst inputs classify as Critical');

// ---------------------------------------------------------------------------
// Realistic customer scenario
// ---------------------------------------------------------------------------

const realisticResult = calculateHealthScore({
  payment: { daysSinceLastPayment: 10, avgPaymentDelayDays: 3, overdueAmount: 200 },
  engagement: { loginFrequencyPerWeek: 4, featureUsageCount: 15, supportTicketCount: 2 },
  contract: { daysUntilRenewal: 120, contractValue: 45000, recentUpgrade: true },
  support: { avgResolutionTimeHours: 12, satisfactionScore: 8, escalationCount: 0 },
});
assert(
  realisticResult.overallScore > 60 && realisticResult.overallScore <= 100,
  `realistic healthy-ish customer scores in a sensible range, got ${realisticResult.overallScore}`
);

// ---------------------------------------------------------------------------
// Edge cases: new customer with insufficient history -> documented default
// ---------------------------------------------------------------------------

const newCustomerResult = calculateHealthScore({
  payment: { hasNoPaymentHistory: true },
  engagement: { loginFrequencyPerWeek: 1, featureUsageCount: 2, supportTicketCount: 0 },
  contract: { daysUntilRenewal: 365, contractValue: 10000, recentUpgrade: false },
  support: { hasNoSupportHistory: true },
});
assertEqual(newCustomerResult.breakdown.payment.normalizedScore, 50, 'no payment history defaults to neutral 50');
assertEqual(newCustomerResult.breakdown.payment.usedDefault, true, 'payment breakdown flags usedDefault');
assertEqual(newCustomerResult.breakdown.support.normalizedScore, 50, 'no support history defaults to neutral 50');
assertEqual(newCustomerResult.breakdown.support.usedDefault, true, 'support breakdown flags usedDefault');

// ---------------------------------------------------------------------------
// Invalid input handling
// ---------------------------------------------------------------------------

assertThrows(
  () => calculatePaymentScore({} as never),
  HealthScoreValidationError,
  'missing payment fields throws HealthScoreValidationError'
);

assertThrows(
  () => calculateEngagementScore({ loginFrequencyPerWeek: 3 } as never),
  HealthScoreValidationError,
  'missing engagement.featureUsageCount throws HealthScoreValidationError'
);

assertThrows(
  () => calculateContractScore({} as never),
  HealthScoreValidationError,
  'missing contract fields throws HealthScoreValidationError'
);

assertThrows(
  () => calculateSupportScore({ avgResolutionTimeHours: 1, satisfactionScore: 15, escalationCount: 0 }),
  HealthScoreValidationError,
  'out-of-range satisfactionScore throws HealthScoreValidationError'
);

assertThrows(
  () => calculatePaymentScore({ daysSinceLastPayment: -5, avgPaymentDelayDays: 0, overdueAmount: 0 }),
  HealthScoreValidationError,
  'negative daysSinceLastPayment throws HealthScoreValidationError'
);

assertThrows(
  () =>
    calculateHealthScore({
      payment: { hasNoPaymentHistory: true },
      engagement: {},
      contract: { daysUntilRenewal: 1, contractValue: 1 },
      support: { hasNoSupportHistory: true },
    } as HealthScoreInput),
  HealthScoreValidationError,
  'missing engagement input at the top level throws HealthScoreValidationError'
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
