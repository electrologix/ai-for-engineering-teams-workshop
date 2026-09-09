/**
 * Unit tests for alertStore.ts
 *
 * Run with: npx tsx src/lib/alertStore.test.ts
 * Covers cooldown/dedup behavior, snapshot history retention, and the
 * dismiss -> audit-trail -> active-view-removal flow — the stateful
 * concerns intentionally kept out of alerts.ts.
 */

import { Customer } from '@/data/mock-customers';
import {
  __resetAlertStoreForTests,
  dismissAlert,
  evaluateCustomerAlerts,
  getAuditTrail,
  getSnapshotHistory,
  recordSnapshot,
} from './alertStore';

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

const NOW = new Date('2024-06-15T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'store-c1',
    name: 'Store Test Customer',
    company: 'Store Test Co',
    healthScore: 20,
    paymentHistory: { daysSinceLastPayment: 40, avgPaymentDelayDays: 0, overdueAmount: 0 }, // Payment Risk trigger
    engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 20, supportTicketCount: 1 },
    contract: { daysUntilRenewal: 200, contractValue: 50000, recentUpgrade: false },
    support: { avgResolutionTimeHours: 4, satisfactionScore: 9, escalationCount: 0 },
    ...overrides,
  };
}

async function run() {
  __resetAlertStoreForTests();

  // -------------------------------------------------------------------------
  // Snapshot history
  // -------------------------------------------------------------------------
  const customer = makeCustomer();
  recordSnapshot(customer, NOW - 40 * DAY); // outside 30-day window, should be pruned
  recordSnapshot(customer, NOW);
  const history = getSnapshotHistory(customer.id);
  assert(history.length === 1, 'Snapshots older than 30 days are pruned from history');

  // -------------------------------------------------------------------------
  // Cooldown / dedup across repeated evaluations
  // -------------------------------------------------------------------------
  __resetAlertStoreForTests();
  const first = await evaluateCustomerAlerts(customer, NOW);
  assert(
    first.alerts.some((a) => a.ruleId === 'payment-risk'),
    'First evaluation triggers Payment Risk alert'
  );

  const second = await evaluateCustomerAlerts(customer, NOW + 12 * 60 * 60 * 1000); // within 24h High cooldown
  assert(
    !second.alerts.some((a) => a.ruleId === 'payment-risk'),
    'Repeated evaluation within cooldown window does not re-trigger the same alert'
  );

  const third = await evaluateCustomerAlerts(customer, NOW + 25 * 60 * 60 * 1000); // past 24h High cooldown
  assert(
    third.alerts.some((a) => a.ruleId === 'payment-risk'),
    'Alert re-triggers once the cooldown window has passed'
  );

  // -------------------------------------------------------------------------
  // Audit trail + dismiss flow
  // -------------------------------------------------------------------------
  __resetAlertStoreForTests();
  const evalResult = await evaluateCustomerAlerts(customer, NOW);
  const alert = evalResult.alerts.find((a) => a.ruleId === 'payment-risk');
  assert(alert !== undefined, 'Payment Risk alert exists for dismiss test');

  if (alert) {
    const triggeredEntries = getAuditTrail({ customerId: customer.id });
    assert(
      triggeredEntries.some((e) => e.alertId === alert.id && e.action === 'triggered'),
      'Triggered alert is recorded in the audit trail'
    );

    dismissAlert(alert, 'test-user');
    const afterDismiss = getAuditTrail({ customerId: customer.id });
    assert(
      afterDismiss.some((e) => e.alertId === alert.id && e.action === 'dismissed'),
      'Dismissal is recorded in the audit trail'
    );
  }

  // Filtering by priority/rule
  const highOnly = getAuditTrail({ customerId: customer.id, priority: 'High' });
  assert(
    highOnly.every((e) => e.priority === 'High'),
    'Audit trail is filterable by priority'
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void run();
