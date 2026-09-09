/**
 * Unit tests for alerts.ts
 *
 * Run with: npx tsx src/lib/alerts.test.ts
 * (No test framework is configured in this project yet; this is a
 * lightweight, dependency-free assertion script covering rule boundary
 * conditions, the sentiment escalation rule, and invalid-input handling —
 * mirroring the convention established by healthCalculator.test.ts.)
 */

import { Customer } from '@/data/mock-customers';
import {
  ALERT_THRESHOLDS,
  Alert,
  AlertValidationError,
  CustomerHealthSnapshot,
  checkContractExpirationRisk,
  checkEngagementCliffAlert,
  checkFeatureAdoptionStall,
  checkMarketSentimentRisk,
  checkPaymentRiskAlert,
  checkSupportTicketSpike,
  evaluateAlerts,
} from './alerts';
import type { MarketIntelligenceResponse } from '@/services/MarketIntelligenceService';

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

function assertThrows(fn: () => void, errorType: new (...args: never[]) => Error, message: string) {
  try {
    fn();
    assert(false, `${message} (expected throw, none occurred)`);
  } catch (err) {
    assert(err instanceof errorType, `${message} (expected ${errorType.name}, got ${(err as Error).name})`);
  }
}

const NOW = new Date('2024-06-15T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Test Customer',
    company: 'Test Co',
    healthScore: 80,
    paymentHistory: { daysSinceLastPayment: 5, avgPaymentDelayDays: 0, overdueAmount: 0 },
    engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 1 },
    contract: { daysUntilRenewal: 200, contractValue: 50000, recentUpgrade: false },
    support: { avgResolutionTimeHours: 4, satisfactionScore: 9, escalationCount: 0 },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<CustomerHealthSnapshot> = {}): CustomerHealthSnapshot {
  return {
    customerId: 'c1',
    timestamp: new Date(NOW).toISOString(),
    overallScore: 80,
    riskLevel: 'Healthy',
    breakdown: {} as CustomerHealthSnapshot['breakdown'],
    rawInputs: {
      payment: { daysSinceLastPayment: 5, avgPaymentDelayDays: 0, overdueAmount: 0 },
      engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 1 },
      contract: { daysUntilRenewal: 200, contractValue: 50000, recentUpgrade: false },
      support: { avgResolutionTimeHours: 4, satisfactionScore: 9, escalationCount: 0 },
    },
    ...overrides,
  };
}

function makeMarketData(overrides: Partial<MarketIntelligenceResponse> = {}): MarketIntelligenceResponse {
  return {
    company: 'Test Co',
    sentiment: { score: -0.8, label: 'negative', confidence: 0.9 },
    articleCount: 3,
    headlines: [
      { title: 'Headline 1', source: 'Source A', publishedAt: new Date(NOW).toISOString() },
      { title: 'Headline 2', source: 'Source B', publishedAt: new Date(NOW).toISOString() },
    ],
    lastUpdated: new Date(NOW).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Payment Risk
// ---------------------------------------------------------------------------

assert(
  checkPaymentRiskAlert(
    makeCustomer({ paymentHistory: { daysSinceLastPayment: 31, avgPaymentDelayDays: 0, overdueAmount: 0 } }),
    makeSnapshot(),
    [],
    NOW
  ) !== null,
  'Payment Risk triggers when overdue > 30 days'
);

assert(
  checkPaymentRiskAlert(
    makeCustomer({ paymentHistory: { daysSinceLastPayment: 30, avgPaymentDelayDays: 0, overdueAmount: 0 } }),
    makeSnapshot(),
    [],
    NOW
  ) === null,
  'Payment Risk does not trigger at exactly 30 days (boundary)'
);

assert(
  checkPaymentRiskAlert(
    makeCustomer(),
    makeSnapshot({ overallScore: 55 }),
    [makeSnapshot({ overallScore: 76, timestamp: new Date(NOW - 7 * DAY).toISOString() })],
    NOW
  ) !== null,
  'Payment Risk triggers on >20 point health drop within 7 days'
);

// ---------------------------------------------------------------------------
// Engagement Cliff
// ---------------------------------------------------------------------------

assert(
  checkEngagementCliffAlert(
    makeCustomer({ engagement: { loginFrequencyPerWeek: 1, featureUsageCount: 20, supportTicketCount: 1 } }),
    makeSnapshot(),
    [makeSnapshot({ timestamp: new Date(NOW - 10 * DAY).toISOString() })],
    NOW
  ) !== null,
  'Engagement Cliff triggers on >50% login drop vs 30-day avg'
);

assert(
  checkEngagementCliffAlert(
    makeCustomer({ engagement: { loginFrequencyPerWeek: 5, featureUsageCount: 20, supportTicketCount: 1 } }),
    makeSnapshot(),
    [makeSnapshot({ timestamp: new Date(NOW - 10 * DAY).toISOString() })], // avg = 8, drop = 37.5%
    NOW
  ) === null,
  'Engagement Cliff does not trigger below 50% drop'
);

// ---------------------------------------------------------------------------
// Contract Expiration Risk
// ---------------------------------------------------------------------------

assert(
  checkContractExpirationRisk(
    makeCustomer({ contract: { daysUntilRenewal: 89, contractValue: 50000, recentUpgrade: false } }),
    makeSnapshot({ overallScore: 40 }),
    NOW
  ) !== null,
  'Contract Expiration Risk triggers when <90 days AND score <50'
);

assert(
  checkContractExpirationRisk(
    makeCustomer({ contract: { daysUntilRenewal: 89, contractValue: 50000, recentUpgrade: false } }),
    makeSnapshot({ overallScore: 50 }),
    NOW
  ) === null,
  'Contract Expiration Risk does not trigger at score exactly 50 (boundary)'
);

// ---------------------------------------------------------------------------
// Support Ticket Spike
// ---------------------------------------------------------------------------

assert(
  checkSupportTicketSpike(
    makeCustomer({ engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 4 } }),
    makeSnapshot()
  ) !== null,
  'Support Ticket Spike triggers on >3 tickets'
);

assert(
  checkSupportTicketSpike(
    makeCustomer({ support: { avgResolutionTimeHours: 4, satisfactionScore: 9, escalationCount: 1 } }),
    makeSnapshot()
  ) !== null,
  'Support Ticket Spike triggers on any escalation regardless of volume'
);

// ---------------------------------------------------------------------------
// Feature Adoption Stall
// ---------------------------------------------------------------------------

assert(
  checkFeatureAdoptionStall(
    makeCustomer({ subscriptionTier: 'premium', engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 1 } }),
    makeSnapshot(),
    [
      makeSnapshot({
        timestamp: new Date(NOW - 31 * DAY).toISOString(),
        rawInputs: {
          payment: {},
          engagement: { featureUsageCount: 20 },
          contract: {},
          support: {},
        },
      }),
    ],
    NOW
  ) !== null,
  'Feature Adoption Stall triggers for growing account with no usage growth in 30 days'
);

assert(
  checkFeatureAdoptionStall(
    makeCustomer({ subscriptionTier: 'basic', contract: { recentUpgrade: false } }),
    makeSnapshot(),
    [],
    NOW
  ) === null,
  'Feature Adoption Stall does not trigger for non-growing accounts'
);

// ---------------------------------------------------------------------------
// Market Sentiment Risk + escalation
// ---------------------------------------------------------------------------

assert(
  checkMarketSentimentRisk(makeCustomer(), makeSnapshot(), makeMarketData(), undefined, NOW) === null,
  'Market Sentiment does not trigger on a single reading (no prior)'
);

assert(
  checkMarketSentimentRisk(makeCustomer(), makeSnapshot(), makeMarketData(), makeMarketData(), NOW) !== null,
  'Market Sentiment triggers when sustained negative across two consecutive readings'
);

{
  const escalated = checkMarketSentimentRisk(
    makeCustomer(),
    makeSnapshot({ overallScore: 45 }),
    makeMarketData(),
    makeMarketData(),
    NOW
  );
  assert(escalated !== null && escalated.priority === 'High', 'Escalation rule promotes to High when health score <50');
}

{
  const notEscalated = checkMarketSentimentRisk(
    makeCustomer(),
    makeSnapshot({ overallScore: 80 }),
    makeMarketData(),
    makeMarketData(),
    NOW
  );
  assert(
    notEscalated !== null && notEscalated.priority === 'Medium',
    'Sentiment alert stays Medium priority when health score is not <50'
  );
}

{
  const withHeadlines = checkMarketSentimentRisk(makeCustomer(), makeSnapshot(), makeMarketData(), makeMarketData(), NOW);
  assert(
    withHeadlines !== null &&
      Array.isArray(withHeadlines.supportingHeadlines) &&
      withHeadlines.supportingHeadlines.length <= 3 &&
      withHeadlines.supportingHeadlines.length > 0,
    'Sentiment alert includes up to 3 supportingHeadlines'
  );
}

assert(
  checkMarketSentimentRisk(
    makeCustomer(),
    makeSnapshot(),
    makeMarketData({ sentiment: { score: 0.1, label: 'neutral', confidence: 0.9 } }),
    makeMarketData(),
    NOW
  ) === null,
  'Market Sentiment does not trigger when current reading is not negative'
);

// ---------------------------------------------------------------------------
// evaluateAlerts: market data optional, five-rule behavior unaffected
// ---------------------------------------------------------------------------

{
  const alerts = evaluateAlerts(
    makeCustomer({ paymentHistory: { daysSinceLastPayment: 40, avgPaymentDelayDays: 0, overdueAmount: 0 } }),
    makeSnapshot(),
    [],
    { now: NOW }
  );
  assert(
    alerts.length === 1 && alerts[0].ruleId === 'payment-risk',
    'evaluateAlerts works with market data absent (no crash, five-rule behavior intact)'
  );
}

{
  let threw = false;
  try {
    evaluateAlerts(makeCustomer(), makeSnapshot(), [], {
      marketData: makeMarketData(),
      priorMarketData: makeMarketData(),
      now: NOW,
    });
  } catch {
    threw = true;
  }
  assert(!threw, 'evaluateAlerts does not throw when market data is present');
}

// ---------------------------------------------------------------------------
// Prioritization: High before Medium
// ---------------------------------------------------------------------------

{
  const customer = makeCustomer({
    paymentHistory: { daysSinceLastPayment: 40, avgPaymentDelayDays: 0, overdueAmount: 0 }, // High
    engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 5 }, // Medium
  });
  const alerts = evaluateAlerts(customer, makeSnapshot(), [], { now: NOW });
  assert(
    alerts.length >= 2 && alerts[0].priority === 'High' && alerts[alerts.length - 1].priority === 'Medium',
    'evaluateAlerts ranks High priority alerts before Medium'
  );
}

// ---------------------------------------------------------------------------
// Invalid input handling
// ---------------------------------------------------------------------------

assertThrows(
  () => checkPaymentRiskAlert(null as unknown as Customer, makeSnapshot(), []),
  AlertValidationError,
  'checkPaymentRiskAlert throws AlertValidationError for missing customer'
);

assertThrows(
  () => evaluateAlerts(makeCustomer(), null as unknown as CustomerHealthSnapshot, []),
  AlertValidationError,
  'evaluateAlerts throws AlertValidationError for missing snapshot'
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

// Re-export types used only for type-checking above (avoids unused-import lint noise).
export type { Alert };
export { ALERT_THRESHOLDS };
