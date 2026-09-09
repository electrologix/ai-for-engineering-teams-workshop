'use client';

import { useCallback, useEffect, useState } from 'react';
import { Customer } from '@/data/mock-customers';
import { Alert, AlertPriority } from '@/lib/alerts';
import { AlertAuditEntry, dismissAlert, evaluateCustomerAlerts, getAuditTrail } from '@/lib/alertStore';

export interface PredictiveAlertsPanelProps {
  customer: Customer | null;
  isLoading?: boolean;
}

function getPriorityClasses(priority: AlertPriority): string {
  return priority === 'High'
    ? 'bg-red-100 text-red-800 border-red-300'
    : 'bg-yellow-100 text-yellow-800 border-yellow-300';
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AlertItem({ alert, onDismiss }: { alert: Alert; onDismiss: (alert: Alert) => void }) {
  return (
    <li className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${getPriorityClasses(
                alert.priority
              )}`}
            >
              {alert.priority}
            </span>
            <h4 className="truncate text-sm font-semibold text-gray-900">{alert.title}</h4>
          </div>
          <p className="mt-1 text-sm text-gray-700">{alert.message}</p>
          <p className="mt-1 text-xs text-gray-500">
            Recommended: {alert.recommendedAction}
          </p>
          <p className="mt-1 text-xs text-gray-400">{formatTimestamp(alert.triggeredAt)}</p>

          {alert.supportingHeadlines && alert.supportingHeadlines.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-gray-200 pl-2">
              {alert.supportingHeadlines.map((headline, index) => (
                <li key={`${headline.title}-${index}`} className="text-xs">
                  {/* Plain-text rendering only — no dangerouslySetInnerHTML,
                      matching MarketIntelligenceWidget's XSS-prevention approach. */}
                  <p className="text-gray-700">{headline.title}</p>
                  <p className="text-gray-400">
                    {headline.source} &middot; {formatTimestamp(headline.publishedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(alert)}
          className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

export default function PredictiveAlertsPanel({ customer, isLoading = false }: PredictiveAlertsPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentimentUnavailable, setSentimentUnavailable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPriority, setHistoryPriority] = useState<AlertPriority | 'all'>('all');
  const [historyRule, setHistoryRule] = useState<string>('all');

  const runEvaluation = useCallback(async (targetCustomer: Customer) => {
    setIsEvaluating(true);
    setError(null);
    try {
      const result = await evaluateCustomerAlerts(targetCustomer);
      setAlerts(result.alerts);
      // A Market Intelligence failure only disables the sentiment rule this
      // cycle — it must never block or blank out the core internal alerts.
      setSentimentUnavailable(Boolean(result.marketError));
    } catch (err) {
      setAlerts([]);
      setError(err instanceof Error ? err.message : 'Unable to evaluate alerts.');
    } finally {
      setIsEvaluating(false);
    }
  }, []);

  useEffect(() => {
    if (customer) {
      void runEvaluation(customer);
    } else {
      setAlerts([]);
      setError(null);
      setSentimentUnavailable(false);
    }
  }, [customer, runEvaluation]);

  const handleDismiss = useCallback((alert: Alert) => {
    dismissAlert(alert);
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  }, []);

  const auditEntries: AlertAuditEntry[] = customer
    ? getAuditTrail({
        customerId: customer.id,
        priority: historyPriority === 'all' ? undefined : historyPriority,
        ruleId: historyRule === 'all' ? undefined : historyRule,
      })
    : [];

  if (isLoading) {
    return (
      <div className="w-full rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-sm text-gray-500">Loading predictive alerts...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="w-full rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-sm text-gray-500">Select a customer to view predictive alerts.</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">Predictive Alerts</h3>
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {showHistory ? 'Hide history' : 'Show history'}
        </button>
      </div>

      {isEvaluating && <p className="mt-2 text-sm text-gray-500">Evaluating alerts...</p>}

      {!isEvaluating && error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {!isEvaluating && !error && sentimentUnavailable && (
        <p className="mt-2 text-xs text-gray-400">
          Sentiment data unavailable — showing internally-sourced alerts only.
        </p>
      )}

      {!isEvaluating && !error && (
        alerts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No active alerts for this customer.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} onDismiss={handleDismiss} />
            ))}
          </ul>
        )
      )}

      {showHistory && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h4 className="text-sm font-semibold text-gray-900">Alert history</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="flex flex-col text-xs text-gray-600">
              Priority
              <select
                value={historyPriority}
                onChange={(e) => setHistoryPriority(e.target.value as AlertPriority | 'all')}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-600">
              Rule
              <select
                value={historyRule}
                onChange={(e) => setHistoryRule(e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="payment-risk">Payment Risk</option>
                <option value="engagement-cliff">Engagement Cliff</option>
                <option value="contract-expiration-risk">Contract Expiration Risk</option>
                <option value="support-ticket-spike">Support Ticket Spike</option>
                <option value="feature-adoption-stall">Feature Adoption Stall</option>
                <option value="market-sentiment-negative">Market Sentiment</option>
              </select>
            </label>
          </div>

          {auditEntries.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">No historical alerts recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {auditEntries.map((entry, index) => (
                <li key={`${entry.alertId}-${entry.action}-${index}`} className="text-xs text-gray-600">
                  <span
                    className={`mr-1 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${getPriorityClasses(
                      entry.priority
                    )}`}
                  >
                    {entry.priority}
                  </span>
                  {entry.title} &middot; {entry.action} &middot; {formatTimestamp(entry.timestamp)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
