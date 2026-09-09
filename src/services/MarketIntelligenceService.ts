/**
 * Service layer for market intelligence data.
 * Wraps mock data generation with caching and centralized error handling.
 */

import {
  generateMockMarketData,
  calculateMockSentiment,
  MockHeadline
} from '@/data/mock-market-intelligence';

export interface MarketIntelligenceResponse {
  company: string;
  sentiment: {
    score: number;
    label: 'positive' | 'neutral' | 'negative';
    confidence: number;
  };
  articleCount: number;
  headlines: MockHeadline[];
  lastUpdated: string;
}

/**
 * Custom error type for market intelligence failures.
 * Carries an HTTP-friendly status code while keeping messages generic
 * enough to surface directly to clients without leaking internals.
 */
export class MarketIntelligenceError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MarketIntelligenceError';
    this.statusCode = statusCode;
  }
}

interface CacheEntry {
  data: MarketIntelligenceResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_COMPANY_LENGTH = 100;
// Printable characters plus common punctuation used in company names.
const VALID_COMPANY_PATTERN = /^[\p{L}\p{N}\s.,&'\-]+$/u;

const cache = new Map<string, CacheEntry>();

function normalizeCompanyKey(company: string): string {
  return company.trim().toLowerCase();
}

function validateCompany(company: string): string {
  if (typeof company !== 'string') {
    throw new MarketIntelligenceError('Invalid company parameter.', 400);
  }

  const trimmed = company.trim();

  if (trimmed.length === 0) {
    throw new MarketIntelligenceError('Company name is required.', 400);
  }

  if (trimmed.length > MAX_COMPANY_LENGTH) {
    throw new MarketIntelligenceError('Company name is too long.', 400);
  }

  if (!VALID_COMPANY_PATTERN.test(trimmed)) {
    throw new MarketIntelligenceError('Company name contains invalid characters.', 400);
  }

  return trimmed;
}

/**
 * Service exposing market intelligence lookups with an in-memory cache.
 * Pure aside from the module-level cache map, so behavior is deterministic
 * and testable given a fixed cache state.
 */
export const MarketIntelligenceService = {
  async getMarketIntelligence(company: string): Promise<MarketIntelligenceResponse> {
    const sanitizedCompany = validateCompany(company);
    const cacheKey = normalizeCompanyKey(sanitizedCompany);

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const marketData = generateMockMarketData(sanitizedCompany);
    const sentiment = calculateMockSentiment(marketData.headlines);

    const response: MarketIntelligenceResponse = {
      company: sanitizedCompany,
      sentiment,
      articleCount: marketData.articleCount,
      headlines: marketData.headlines.slice(0, 3),
      lastUpdated: new Date().toISOString()
    };

    cache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return response;
  },

  /** Exposed for testing/inspection; clears all cached entries. */
  clearCache(): void {
    cache.clear();
  }
};
