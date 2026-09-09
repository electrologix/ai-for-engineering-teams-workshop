'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MarketIntelligenceResponse } from '@/services/MarketIntelligenceService';

export interface MarketIntelligenceWidgetProps {
  company?: string;
}

const MAX_COMPANY_LENGTH = 100;

function getSentimentClasses(label: MarketIntelligenceResponse['sentiment']['label']): string {
  if (label === 'positive') {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  if (label === 'negative') {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function validateCompanyInput(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Company name is required.';
  }
  if (trimmed.length > MAX_COMPANY_LENGTH) {
    return 'Company name is too long.';
  }
  return null;
}

export default function MarketIntelligenceWidget({ company }: MarketIntelligenceWidgetProps) {
  const isControlled = company !== undefined && company.trim().length > 0;

  const [inputValue, setInputValue] = useState(company ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [data, setData] = useState<MarketIntelligenceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntelligence = useCallback(async (companyName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/market-intelligence/${encodeURIComponent(companyName)}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || 'Unable to load market intelligence.');
      }

      setData(body as MarketIntelligenceResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load market intelligence.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Dashboard-driven usage: auto-fetch whenever the `company` prop changes.
  useEffect(() => {
    if (isControlled && company) {
      setInputValue(company);
      void fetchIntelligence(company);
    }
  }, [company, isControlled, fetchIntelligence]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationMessage = validateCompanyInput(inputValue);
    setValidationError(validationMessage);

    if (validationMessage) {
      return;
    }

    void fetchIntelligence(inputValue.trim());
  };

  return (
    <div className="w-full max-w-[400px] min-h-[120px] rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {!isControlled && (
        <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
          <label htmlFor="market-intelligence-company" className="sr-only">
            Company name
          </label>
          <input
            id="market-intelligence-company"
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Enter company name"
            maxLength={MAX_COMPANY_LENGTH}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Search
          </button>
        </form>
      )}

      {validationError && (
        <p className="mb-2 text-xs text-red-600">{validationError}</p>
      )}

      {isLoading && (
        <div className="text-sm text-gray-500">Loading market intelligence...</div>
      )}

      {!isLoading && error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {!isLoading && !error && data && (
        <div>
          <h3 className="truncate text-base font-semibold text-gray-900">{data.company}</h3>

          <span
            className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getSentimentClasses(
              data.sentiment.label
            )}`}
          >
            {data.sentiment.label}
          </span>

          <p className="mt-2 text-xs text-gray-500">
            {data.articleCount} article{data.articleCount === 1 ? '' : 's'} &middot; Updated{' '}
            {formatDate(data.lastUpdated)}
          </p>

          {data.headlines.length > 0 && (
            <ul className="mt-3 space-y-2">
              {data.headlines.slice(0, 3).map((headline, index) => (
                <li key={`${headline.title}-${index}`} className="text-xs">
                  <p className="text-gray-800">{headline.title}</p>
                  <p className="text-gray-500">
                    {headline.source} &middot; {formatDate(headline.publishedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!isLoading && !error && !data && !isControlled && (
        <p className="text-sm text-gray-500">Enter a company name to see market intelligence.</p>
      )}
    </div>
  );
}
