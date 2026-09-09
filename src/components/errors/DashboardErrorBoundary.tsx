'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { DashboardError, reportError } from '@/lib/errors';

export interface DashboardErrorBoundaryProps {
  maxRetries?: number;
  children: ReactNode;
}

interface DashboardErrorBoundaryState {
  hasError: boolean;
  message: string | null;
  retryCount: number;
  retryLimitReached: boolean;
}

const DEFAULT_MAX_RETRIES = 3;

/**
 * Top-level boundary that catches errors escaping individual widget
 * boundaries, so a single unexpected failure never crashes the whole app.
 */
export class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  state: DashboardErrorBoundaryState = {
    hasError: false,
    message: null,
    retryCount: 0,
    retryLimitReached: false,
  };

  static getDerivedStateFromError(): Partial<DashboardErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const dashboardError = new DashboardError(error.message, 'dashboard', {
      retryCount: this.state.retryCount,
      componentStack: info.componentStack ?? undefined,
    });
    reportError(dashboardError);
    this.setState({ message: error.message });
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
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    const { children } = this.props;
    const { hasError, retryLimitReached } = this.state;
    const isProd = process.env.NODE_ENV === 'production';

    if (hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-red-300 bg-red-50 p-8 text-center"
        >
          <h2 className="text-lg font-semibold text-red-900">The dashboard hit an unexpected error</h2>
          <p className="max-w-md text-sm text-red-700">
            {isProd
              ? 'We were unable to display the dashboard. Please try again.'
              : this.state.message ?? 'Unknown error'}
          </p>
          <div className="flex gap-3">
            {!retryLimitReached && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Reload dashboard
            </button>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  }
}

export default DashboardErrorBoundary;
