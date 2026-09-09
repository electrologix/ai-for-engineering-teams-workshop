/**
 * Shared error types for the Customer Intelligence Dashboard.
 * Used by DashboardErrorBoundary / WidgetErrorBoundary to categorize
 * failures and by the monitoring/logging integration point.
 */

export type ErrorCategory = 'widget' | 'dashboard' | 'export' | 'network';

export interface ErrorContext {
  widgetId?: string;
  timestamp: number;
  retryCount?: number;
  [key: string]: unknown;
}

export class DashboardError extends Error {
  readonly category: ErrorCategory;
  readonly context: ErrorContext;

  constructor(message: string, category: ErrorCategory, context: Partial<ErrorContext> = {}) {
    super(message);
    this.name = 'DashboardError';
    this.category = category;
    this.context = { timestamp: Date.now(), ...context };
  }
}

export class WidgetError extends DashboardError {
  constructor(message: string, widgetId: string, context: Partial<ErrorContext> = {}) {
    super(message, 'widget', { widgetId, ...context });
    this.name = 'WidgetError';
  }
}

export class ExportValidationError extends DashboardError {
  constructor(message: string, context: Partial<ErrorContext> = {}) {
    super(message, 'export', context);
    this.name = 'ExportValidationError';
  }
}

/**
 * Development-safe error reporter. In production this should be swapped for a
 * pluggable reporter (e.g. Sentry/Datadog); it never receives raw customer PII,
 * only category/context metadata plus a message.
 */
export function reportError(error: DashboardError | Error, extra?: Record<string, unknown>): void {
  const isProd = process.env.NODE_ENV === 'production';
  const payload = {
    name: error.name,
    message: error.message,
    category: error instanceof DashboardError ? error.category : 'dashboard',
    context: error instanceof DashboardError ? error.context : { timestamp: Date.now() },
    ...extra,
  };

  if (isProd) {
    // Pluggable production reporter integration point.
    // e.g. window.__DASHBOARD_REPORTER__?.report(payload)
    if (typeof window !== 'undefined' && (window as unknown as { __DASHBOARD_REPORTER__?: { report: (p: unknown) => void } }).__DASHBOARD_REPORTER__) {
      (window as unknown as { __DASHBOARD_REPORTER__: { report: (p: unknown) => void } }).__DASHBOARD_REPORTER__.report(payload);
    }
  } else {
    console.error('[dashboard-error]', payload);
  }
}
