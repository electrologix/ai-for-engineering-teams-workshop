'use client';

import { useMemo, useState } from 'react';
import { Customer } from '@/data/mock-customers';
import {
  calculateHealthScore,
  HealthScoreValidationError,
  HealthScoreResult,
  FactorBreakdown,
} from '@/lib/healthCalculator';

export interface CustomerHealthDisplayProps {
  customer: Customer | null;
  isLoading?: boolean;
}

function getScoreColorClasses(score: number): string {
  if (score <= 30) return 'bg-red-100 text-red-800 border-red-300';
  if (score <= 70) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-green-100 text-green-800 border-green-300';
}

function getBarColorClasses(score: number): string {
  if (score <= 30) return 'bg-red-500';
  if (score <= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function FactorRow({ factor }: { factor: FactorBreakdown }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {factor.label}{' '}
          <span className="font-normal text-gray-500">({Math.round(factor.weight * 100)}%)</span>
          {factor.usedDefault && (
            <span className="ml-1 text-xs font-normal text-gray-400">(default)</span>
          )}
        </p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
          <div
            className={`h-1.5 rounded-full ${getBarColorClasses(factor.normalizedScore)}`}
            style={{ width: `${factor.normalizedScore}%` }}
          />
        </div>
      </div>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-gray-600">
        {factor.normalizedScore}
      </span>
    </li>
  );
}

function buildHealthScoreInput(customer: Customer) {
  return {
    payment: customer.paymentHistory ?? { hasNoPaymentHistory: true },
    engagement: customer.engagement ?? {},
    contract: customer.contract ?? {},
    support: customer.support ?? { hasNoSupportHistory: true },
  };
}

export default function CustomerHealthDisplay({
  customer,
  isLoading = false,
}: CustomerHealthDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { result, error } = useMemo<{
    result: HealthScoreResult | null;
    error: string | null;
  }>(() => {
    if (!customer) return { result: null, error: null };
    try {
      return { result: calculateHealthScore(buildHealthScoreInput(customer)), error: null };
    } catch (err) {
      if (err instanceof HealthScoreValidationError) {
        return { result: null, error: err.message };
      }
      return { result: null, error: 'Unable to calculate health score.' };
    }
    // Recompute only when the selected customer identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  if (isLoading) {
    return (
      <div className="w-full max-w-md rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-sm text-gray-500">Loading health score...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="w-full max-w-md rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-sm text-gray-500">Select a customer to view their health score.</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
        <p className="text-sm font-medium text-red-800">Unable to calculate health score</p>
        <p className="mt-1 text-xs text-red-700">{error}</p>
      </div>
    );
  }

  const { overallScore, riskLevel, breakdown } = result;

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">{customer.name}</h3>
          <p className="truncate text-sm text-gray-600">{customer.company}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${getScoreColorClasses(
            overallScore
          )}`}
        >
          {overallScore} · {riskLevel}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {isExpanded ? 'Hide factor breakdown' : 'Show factor breakdown'}
      </button>

      {isExpanded && (
        <ul className="mt-2 divide-y divide-gray-100">
          <FactorRow factor={breakdown.payment} />
          <FactorRow factor={breakdown.engagement} />
          <FactorRow factor={breakdown.contract} />
          <FactorRow factor={breakdown.support} />
        </ul>
      )}
    </div>
  );
}
