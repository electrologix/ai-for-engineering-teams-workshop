'use client';

import { lazy, ReactNode, Suspense, useCallback, useMemo, useState, useRef } from 'react';
import DashboardErrorBoundary from '@/components/errors/DashboardErrorBoundary';
import WidgetErrorBoundary from '@/components/errors/WidgetErrorBoundary';
import {
  ExportFormat,
  ExportRequest,
  ExportSource,
  exportData,
  triggerDownload,
  validateExportRequest,
} from '@/lib/export/ExportUtils';
import { Customer, mockCustomers } from '@/data/mock-customers';
import { calculateHealthScore, HealthScoreValidationError } from '@/lib/healthCalculator';
import { getAuditTrail } from '@/lib/alertStore';
import { MarketIntelligenceService } from '@/services/MarketIntelligenceService';

export interface DashboardOrchestratorProps {
  /** Optional override for widget retry limits (default 3). */
  maxRetriesPerWidget?: number;
  /** Optional override for export rate limiting window in ms (default 2000). */
  exportRateLimitMs?: number;
}

type WidgetStatus = 'loading' | 'ready' | 'error';

interface WidgetMeta {
  id: string;
  name: string;
  minHeight: number;
}

interface WidgetDefinition extends WidgetMeta {
  /** Renders this widget slot's real, code-split component with its props. */
  render: () => ReactNode;
}

// Static metadata (id/name/minHeight) never changes across renders, so it's
// declared outside the component and used both for the widget grid and for
// status-change lookups — avoids recreating it (and the associated
// exhaustive-deps churn) every time `selectedCustomer` changes.
const WIDGET_META: WidgetMeta[] = [
  { id: 'customer-selector', name: 'Customer Selector', minHeight: 260 },
  { id: 'customer-health', name: 'Customer Health', minHeight: 200 },
  { id: 'domain-health', name: 'Domain Health', minHeight: 220 },
  { id: 'market-intelligence', name: 'Market Intelligence', minHeight: 160 },
  { id: 'predictive-alerts', name: 'Predictive Alerts', minHeight: 160 },
];

// Widgets are lazily loaded (code-split) so a slow widget never blocks
// others from rendering. CustomerSelector, Market Intelligence, and
// Predictive Alerts are the real, spec-built components; Domain Health has
// no spec/implementation yet and keeps its placeholder behind the same
// Suspense/WidgetErrorBoundary contract, so swapping it in later requires
// no orchestrator changes.
const CustomerSelector = lazy(() => import('@/components/CustomerSelector'));
const CustomerHealthDisplay = lazy(() => import('@/components/CustomerHealthDisplay'));
const DomainHealthWidget = lazy(() => import('@/components/widgets/DomainHealthWidget'));
const MarketIntelligenceWidget = lazy(() => import('@/components/MarketIntelligenceWidget'));
const PredictiveAlertsPanel = lazy(() => import('@/components/PredictiveAlertsPanel'));

const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json'];
const SEGMENTS = ['all', 'enterprise', 'premium', 'basic', 'at-risk', 'healthy'];
const EXPORT_SOURCES: { value: ExportSource; label: string }[] = [
  { value: 'customer-data', label: 'Customer data' },
  { value: 'health-score-report', label: 'Health score report' },
  { value: 'alert-history', label: 'Alert / audit history' },
  { value: 'market-intelligence', label: 'Market intelligence summary' },
];

function WidgetSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-lg border border-gray-200 bg-gray-100"
      style={{ minHeight }}
    />
  );
}

/** Builds health-score-report export rows, skipping customers with invalid/incomplete inputs. */
function buildHealthScoreReportRows(customers: Customer[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const customer of customers) {
    try {
      const result = calculateHealthScore({
        payment: customer.paymentHistory ?? { hasNoPaymentHistory: true },
        engagement: customer.engagement ?? {},
        contract: customer.contract ?? {},
        support: customer.support ?? { hasNoSupportHistory: true },
      });
      rows.push({
        customerId: customer.id,
        name: customer.name,
        company: customer.company,
        overallScore: result.overallScore,
        riskLevel: result.riskLevel,
        paymentScore: result.breakdown.payment.normalizedScore,
        engagementScore: result.breakdown.engagement.normalizedScore,
        contractScore: result.breakdown.contract.normalizedScore,
        supportScore: result.breakdown.support.normalizedScore,
      });
    } catch (err) {
      if (!(err instanceof HealthScoreValidationError)) throw err;
      // Skip customers with insufficient data for a health score report row.
    }
  }
  return rows;
}

/** Builds alert/audit history export rows from the alert store's audit trail. */
function buildAlertHistoryRows(): Record<string, unknown>[] {
  return getAuditTrail().map((entry) => ({
    alertId: entry.alertId,
    customerId: entry.customerId,
    ruleId: entry.ruleId,
    priority: entry.priority,
    title: entry.title,
    action: entry.action,
    timestamp: entry.timestamp,
    actor: entry.actor ?? '',
  }));
}

/** Builds market-intelligence summary export rows via the cached service (no new fetches beyond its TTL). */
async function buildMarketIntelligenceRows(customers: Customer[]): Promise<Record<string, unknown>[]> {
  const companies = Array.from(new Set(customers.map((c) => c.company)));
  const results = await Promise.allSettled(
    companies.map((company) => MarketIntelligenceService.getMarketIntelligence(company))
  );

  const rows: Record<string, unknown>[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const data = result.value;
      rows.push({
        company: data.company,
        sentimentLabel: data.sentiment.label,
        sentimentScore: data.sentiment.score,
        sentimentConfidence: data.sentiment.confidence,
        articleCount: data.articleCount,
        lastUpdated: data.lastUpdated,
      });
    } else {
      rows.push({ company: companies[index], sentimentLabel: 'unavailable', sentimentScore: '', sentimentConfidence: '', articleCount: '', lastUpdated: '' });
    }
  });
  return rows;
}

export default function DashboardOrchestrator({
  maxRetriesPerWidget = 3,
  exportRateLimitMs = 2000,
}: DashboardOrchestratorProps) {
  const [statuses, setStatuses] = useState<Record<string, WidgetStatus>>({});
  const [liveMessage, setLiveMessage] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportSource, setExportSource] = useState<ExportSource>('customer-data');
  const [segment, setSegment] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const lastExportAt = useRef(0);

  const handleWidgetStatusChange = useCallback(
    (widgetId: string, status: 'error' | 'ready', message?: string) => {
      setStatuses((prev) => ({ ...prev, [widgetId]: status }));
      const widget = WIDGET_META.find((w) => w.id === widgetId);
      const widgetName = widget?.name ?? widgetId;
      setLiveMessage(
        status === 'error'
          ? `${widgetName} encountered an error${message ? `: ${message}` : ''}.`
          : `${widgetName} recovered.`,
      );
    },
    [],
  );

  const handleSelectCustomer = useCallback((customer: Customer | null) => {
    setSelectedCustomer(customer);
  }, []);

  const handleExport = useCallback(async () => {
    setExportError(null);

    const now = Date.now();
    if (now - lastExportAt.current < exportRateLimitMs) {
      setExportError('Please wait before requesting another export.');
      return;
    }

    const request: ExportRequest = {
      format: exportFormat,
      dateRange: { start: startDate, end: endDate },
      segment,
      source: exportSource,
    };

    const validation = validateExportRequest(request);
    if (!validation.valid) {
      setExportError(validation.errors.join(' '));
      return;
    }

    lastExportAt.current = now;
    setIsExporting(true);

    try {
      let rows: Record<string, unknown>[];
      switch (exportSource) {
        case 'health-score-report':
          rows = buildHealthScoreReportRows(mockCustomers);
          break;
        case 'alert-history':
          rows = buildAlertHistoryRows();
          break;
        case 'market-intelligence':
          rows = await buildMarketIntelligenceRows(mockCustomers);
          break;
        case 'customer-data':
        default:
          rows = mockCustomers as unknown as Record<string, unknown>[];
          break;
      }

      const content = exportData(exportFormat, rows);
      triggerDownload(`${exportSource}.${exportFormat}`, content, exportFormat);
    } catch {
      setExportError('Unable to prepare export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [exportFormat, exportSource, segment, startDate, endDate, exportRateLimitMs]);

  const renderers: Record<string, () => ReactNode> = useMemo(
    () => ({
      'customer-selector': () => (
        <CustomerSelector
          selectedCustomerId={selectedCustomer?.id ?? null}
          onSelectCustomer={handleSelectCustomer}
        />
      ),
      'customer-health': () => <CustomerHealthDisplay customer={selectedCustomer} />,
      'domain-health': () => <DomainHealthWidget />,
      'market-intelligence': () => <MarketIntelligenceWidget company={selectedCustomer?.company} />,
      'predictive-alerts': () => <PredictiveAlertsPanel customer={selectedCustomer} />,
    }),
    [selectedCustomer, handleSelectCustomer],
  );

  const WIDGETS: WidgetDefinition[] = useMemo(
    () => WIDGET_META.map((meta) => ({ ...meta, render: renderers[meta.id] })),
    [renderers],
  );

  const erroredWidgetCount = useMemo(
    () => Object.values(statuses).filter((s) => s === 'error').length,
    [statuses],
  );

  return (
    <DashboardErrorBoundary>
      <div className="mx-auto max-w-7xl space-y-6 p-4">
        <header>
          <h1 className="text-xl font-semibold text-gray-900">Customer Intelligence Dashboard</h1>
          {erroredWidgetCount > 0 && (
            <p className="mt-1 text-xs font-medium text-red-700">
              {erroredWidgetCount} widget{erroredWidgetCount > 1 ? 's' : ''} unavailable — the rest of the
              dashboard remains interactive.
            </p>
          )}
        </header>

        <div aria-live="polite" className="sr-only">
          {liveMessage}
        </div>

        <section aria-label="Export controls" className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Export</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-gray-600">
              Format
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs text-gray-600">
              Source
              <select
                value={exportSource}
                onChange={(e) => setExportSource(e.target.value as ExportSource)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {EXPORT_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs text-gray-600">
              Segment
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs text-gray-600">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </label>

            <label className="flex flex-col text-xs text-gray-600">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
          {exportError && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {exportError}
            </p>
          )}
        </section>

        <section
          aria-label="Dashboard widgets"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {WIDGETS.map(({ id, name, render, minHeight }) => (
            <div key={id} className="min-w-0">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{name}</h2>
              <WidgetErrorBoundary
                widgetId={id}
                widgetName={name}
                minHeight={minHeight}
                maxRetries={maxRetriesPerWidget}
                onStatusChange={handleWidgetStatusChange}
              >
                <Suspense fallback={<WidgetSkeleton minHeight={minHeight} />}>{render()}</Suspense>
              </WidgetErrorBoundary>
            </div>
          ))}
        </section>
      </div>
    </DashboardErrorBoundary>
  );
}
