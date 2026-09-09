/**
 * Alert Store
 *
 * Non-pure orchestration layer for the Predictive Alerts feature. Owns every
 * stateful concern kept out of `src/lib/alerts.ts` to preserve its purity:
 *   - per-customer health snapshot history (rolling 30-day window)
 *   - per-company market-sentiment history (for sustained-trend detection)
 *   - cooldown bookkeeping per customer+rule
 *   - the alert audit trail (triggered + dismissed actions)
 *
 * This module also owns the only call site for `MarketIntelligenceService`
 * in the alerts feature — `alerts.ts` itself performs no I/O.
 */

import { Customer } from '@/data/mock-customers';
import { calculateHealthScore, HealthScoreInput } from '@/lib/healthCalculator';
import {
  Alert,
  ALERT_COOLDOWN_MS,
  ALERT_RULES,
  AlertPriority,
  CustomerHealthSnapshot,
  evaluateAlerts,
} from '@/lib/alerts';
import { MarketIntelligenceResponse, MarketIntelligenceService } from '@/services/MarketIntelligenceService';

const SNAPSHOT_WINDOW_DAYS = 30;
const SENTIMENT_HISTORY_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AlertAuditEntry {
  alertId: string;
  customerId: string;
  ruleId: string;
  priority: AlertPriority;
  title: string;
  action: 'triggered' | 'dismissed';
  timestamp: string;
  /** Mock/local actor for the workshop — who dismissed the alert, if applicable. */
  actor?: string;
}

export interface AuditTrailFilters {
  customerId?: string;
  priority?: AlertPriority;
  ruleId?: string;
}

export interface EvaluateCustomerAlertsResult {
  alerts: Alert[];
  snapshot: CustomerHealthSnapshot;
  marketData: MarketIntelligenceResponse | null;
  /** Non-null only when the Market Intelligence fetch failed; sentiment rule simply didn't run. */
  marketError: string | null;
}

// ---------------------------------------------------------------------------
// In-memory state (workshop-scale; interface designed so a real persistence
// layer — e.g. a database-backed store — could be swapped in without
// changing callers).
// ---------------------------------------------------------------------------

const snapshotHistory = new Map<string, CustomerHealthSnapshot[]>();
const sentimentHistory = new Map<string, MarketIntelligenceResponse[]>();
const cooldownExpiry = new Map<string, number>();
const dismissedAlertIds = new Set<string>();
const auditTrail: AlertAuditEntry[] = [];

function buildHealthScoreInput(customer: Customer): HealthScoreInput {
  return {
    payment: customer.paymentHistory ?? { hasNoPaymentHistory: true },
    engagement: customer.engagement ?? {},
    contract: customer.contract ?? {},
    support: customer.support ?? { hasNoSupportHistory: true },
  };
}

function cooldownKey(customerId: string, ruleId: string): string {
  return `${customerId}:${ruleId}`;
}

function isOnCooldown(customerId: string, ruleId: string, now: number): boolean {
  const expiry = cooldownExpiry.get(cooldownKey(customerId, ruleId));
  return expiry !== undefined && expiry > now;
}

function ruleCooldownMs(ruleId: string, priority: AlertPriority): number {
  return ALERT_RULES.find((r) => r.id === ruleId)?.cooldownMs ?? ALERT_COOLDOWN_MS[priority];
}

// ---------------------------------------------------------------------------
// Snapshot history
// ---------------------------------------------------------------------------

/**
 * Runs `calculateHealthScore` for the customer, records the resulting
 * snapshot in the rolling 30-day history, and returns it.
 */
export function recordSnapshot(customer: Customer, now: number = Date.now()): CustomerHealthSnapshot {
  const rawInputs = buildHealthScoreInput(customer);
  const result = calculateHealthScore(rawInputs);

  const snapshot: CustomerHealthSnapshot = {
    customerId: customer.id,
    timestamp: new Date(now).toISOString(),
    overallScore: result.overallScore,
    riskLevel: result.riskLevel,
    breakdown: result.breakdown,
    rawInputs,
  };

  const cutoff = now - SNAPSHOT_WINDOW_DAYS * MS_PER_DAY;
  const existing = snapshotHistory.get(customer.id) ?? [];
  const pruned = existing.filter((s) => new Date(s.timestamp).getTime() >= cutoff);
  pruned.push(snapshot);
  snapshotHistory.set(customer.id, pruned);

  return snapshot;
}

/** Returns the retained (rolling 30-day) snapshot history for a customer, oldest-first. */
export function getSnapshotHistory(customerId: string): CustomerHealthSnapshot[] {
  return snapshotHistory.get(customerId) ?? [];
}

// ---------------------------------------------------------------------------
// Market sentiment history + fetch orchestration
// ---------------------------------------------------------------------------

async function fetchMarketSentiment(company: string): Promise<{
  current: MarketIntelligenceResponse | null;
  prior: MarketIntelligenceResponse | null;
  error: string | null;
}> {
  const key = company.trim().toLowerCase();

  try {
    const current = await MarketIntelligenceService.getMarketIntelligence(company);
    const history = sentimentHistory.get(key) ?? [];
    const prior = history.length > 0 ? history[history.length - 1] : null;

    const next = [...history, current].slice(-SENTIMENT_HISTORY_LIMIT);
    sentimentHistory.set(key, next);

    return { current, prior, error: null };
  } catch (err) {
    // Degrade gracefully: a Market Intelligence failure only disables the
    // sentiment rule this cycle — it must never block the other rules.
    return {
      current: null,
      prior: null,
      error: err instanceof Error ? err.message : 'Unable to load market intelligence.',
    };
  }
}

// ---------------------------------------------------------------------------
// Cooldown + audit trail
// ---------------------------------------------------------------------------

function applyCooldownsAndAudit(alerts: Alert[], now: number): Alert[] {
  const active: Alert[] = [];

  for (const alert of alerts) {
    if (dismissedAlertIds.has(alert.id)) continue;
    if (isOnCooldown(alert.customerId, alert.ruleId, now)) continue;

    active.push(alert);

    cooldownExpiry.set(
      cooldownKey(alert.customerId, alert.ruleId),
      now + ruleCooldownMs(alert.ruleId, alert.priority)
    );

    auditTrail.push({
      alertId: alert.id,
      customerId: alert.customerId,
      ruleId: alert.ruleId,
      priority: alert.priority,
      title: alert.title,
      action: 'triggered',
      timestamp: new Date(now).toISOString(),
    });
  }

  return active;
}

/**
 * Marks an alert as dismissed/acknowledged, records the action in the audit
 * trail, and removes it from the active view (until the underlying rule's
 * cooldown expires and it re-triggers as a new alert instance).
 */
export function dismissAlert(alert: Pick<Alert, 'id' | 'customerId' | 'ruleId' | 'priority' | 'title'>, actor = 'current-user'): void {
  dismissedAlertIds.add(alert.id);
  auditTrail.push({
    alertId: alert.id,
    customerId: alert.customerId,
    ruleId: alert.ruleId,
    priority: alert.priority,
    title: alert.title,
    action: 'dismissed',
    timestamp: new Date().toISOString(),
    actor,
  });
}

/** Historical alerts view, filterable by customer, priority, and rule type. */
export function getAuditTrail(filters: AuditTrailFilters = {}): AlertAuditEntry[] {
  return auditTrail.filter(
    (entry) =>
      (!filters.customerId || entry.customerId === filters.customerId) &&
      (!filters.priority || entry.priority === filters.priority) &&
      (!filters.ruleId || entry.ruleId === filters.ruleId)
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Orchestrates a full alert-evaluation cycle for a customer:
 * records a health snapshot, fetches market sentiment (cached, 10-min TTL,
 * degrading gracefully on failure), evaluates all rules, and applies
 * cooldown/dedup + audit-trail bookkeeping.
 */
export async function evaluateCustomerAlerts(
  customer: Customer,
  now: number = Date.now()
): Promise<EvaluateCustomerAlertsResult> {
  const snapshot = recordSnapshot(customer, now);
  const history = getSnapshotHistory(customer.id);

  const { current: marketData, prior: priorMarketData, error: marketError } = await fetchMarketSentiment(
    customer.company
  );

  const rawAlerts = evaluateAlerts(customer, snapshot, history, {
    marketData: marketData ?? undefined,
    priorMarketData: priorMarketData ?? undefined,
    now,
  });

  const alerts = applyCooldownsAndAudit(rawAlerts, now);

  return { alerts, snapshot, marketData, marketError };
}

/** Test/reset helper — clears all in-memory state. Not used in normal app flow. */
export function __resetAlertStoreForTests(): void {
  snapshotHistory.clear();
  sentimentHistory.clear();
  cooldownExpiry.clear();
  dismissedAlertIds.clear();
  auditTrail.length = 0;
}
