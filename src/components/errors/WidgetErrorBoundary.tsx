'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { WidgetError, reportError } from '@/lib/errors';

export interface WidgetErrorBoundaryProps {
  widgetId: string;
  widgetName: string;
  /** Reserve the same width/height as the real widget to avoid layout shift. */
  minHeight?: number;
  maxRetries?: number;
  onStatusChange?: (widgetId: string, status: 'error' | 'ready', message?: string) => void;
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  message: string | null;
  retryCount: number;
  retryLimitReached: boolean;
}

const DEFAULT_MAX_RETRIES = 3;

/**
 * Isolates a single widget's failures so sibling widgets remain rendered
 * and interactive. Re-mounts only the failed widget on retry, up to a
 * bounded retry count, then shows a persistent fallback.
 */
export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  state: WidgetErrorBoundaryState = {
    hasError: false,
    message: null,
    retryCount: 0,
    retryLimitReached: false,
  };

  static getDerivedStateFromError(): Partial<WidgetErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { widgetId, onStatusChange } = this.props;
    const widgetError = new WidgetError(error.message, widgetId, {
      retryCount: this.state.retryCount,
      componentStack: info.componentStack ?? undefined,
    });
    reportError(widgetError);
    this.setState({ message: error.message });
    onStatusChange?.(widgetId, 'error', error.message);
  }

  handleRetry = () => {
    const maxRetries = this.props.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.setState((prev) => {
      const nextCount = prev.retryCount + 1;
      if (nextCount > maxRetries) {
        return { ...prev, retryLimitReached: true };
      }
      return { hasError: false, message: null, retryCount: nextCount, retryLimitReached: false };
    });
    this.props.onStatusChange?.(this.props.widgetId, 'ready');
  };

  render() {
    const { widgetName, minHeight = 200, children } = this.props;
    const { hasError, retryLimitReached } = this.state;
    const isProd = process.env.NODE_ENV === 'production';

    if (hasError) {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-center"
          style={{ minHeight }}
        >
          <p className="text-sm font-semibold text-red-800">{widgetName} failed to load</p>
          <p className="text-xs text-red-700">
            {isProd
              ? 'Something went wrong loading this widget.'
              : this.state.message ?? 'Unknown error'}
          </p>
          {retryLimitReached ? (
            <p className="text-xs font-medium text-red-700">
              Retry limit reached. Please reload the dashboard.
            </p>
          ) : (
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded border border-red-400 bg-white px-3 py-1 text-xs font-medium text-red-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Retry {widgetName}
            </button>
          )}
        </div>
      );
    }

    return <>{children}</>;
  }
}

export default WidgetErrorBoundary;
