import { useState, useCallback, useEffect, useRef } from 'react';
import type { SkewData } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SKEW_CACHE_TTL_MS = 5 * 60 * 1000;
const SKEW_NEGATIVE_CACHE_TTL_MS = 45 * 1000;
const SKEW_CACHE_MAX_ENTRIES = 32;

interface CachedSkewData {
  data: SkewData;
  timestamp: number;
}

interface FetchSkewOptions {
  preserveCurrentOnNoQuotes?: boolean;
}

interface UseVolatilitySkewReturn {
  skewData: SkewData | null;
  loading: boolean;
  error: string | null;
  fetchSkewData: (
    symbol: string,
    expiration: string,
    options?: FetchSkewOptions,
  ) => Promise<SkewData | null>;
  prefetchSkewData: (symbol: string, expiration: string) => Promise<SkewData | null>;
  clearSkewData: () => void;
}

// Shared across hook instances so remounts and hover previews reuse the same work.
const skewCache = new Map<string, CachedSkewData>();
const inFlightRequests = new Map<string, Promise<SkewData>>();
let cacheGeneration = 0;

function normalizeRequest(symbol: string, expiration: string) {
  return {
    symbol: symbol.trim().toUpperCase(),
    expiration: expiration.trim(),
  };
}

function getCacheKey(symbol: string, expiration: string) {
  return `${symbol}:${expiration}`;
}

export function isNoQuoteSkewData(data: SkewData): boolean {
  if (data.data_status) return data.data_status === 'no_quotes';

  return data.atm_iv === 0 && !data.points.some(
    point => point.call_iv !== null || point.put_iv !== null,
  );
}

function isCachedEntryFresh(cached: CachedSkewData): boolean {
  const ttl = isNoQuoteSkewData(cached.data)
    ? SKEW_NEGATIVE_CACHE_TTL_MS
    : SKEW_CACHE_TTL_MS;
  return Date.now() - cached.timestamp < ttl;
}

function getCachedEntry(key: string): CachedSkewData | undefined {
  const cached = skewCache.get(key);
  if (!cached) return undefined;

  // Touch the entry so insertion order acts as a lightweight LRU.
  skewCache.delete(key);
  skewCache.set(key, cached);
  return cached;
}

function cacheSkewData(key: string, data: SkewData) {
  skewCache.delete(key);
  skewCache.set(key, { data, timestamp: Date.now() });

  while (skewCache.size > SKEW_CACHE_MAX_ENTRIES) {
    const oldestKey = skewCache.keys().next().value;
    if (oldestKey === undefined) break;
    skewCache.delete(oldestKey);
  }
}

async function requestSkewData(symbol: string, expiration: string): Promise<SkewData> {
  const key = getCacheKey(symbol, expiration);
  const cached = getCachedEntry(key);
  if (cached && isCachedEntryFresh(cached)) {
    return cached.data;
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const requestGeneration = cacheGeneration;
  const request = (async () => {
    const response = await fetch(
      `${API_BASE}/volatility-skew/${symbol}?expiration=${encodeURIComponent(expiration)}`,
      { method: 'GET' },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData.detail || `Failed to fetch volatility skew: ${response.status}`);
    }

    const result = await response.json();
    if (!result.data) {
      throw new Error('No skew data available');
    }

    if (requestGeneration === cacheGeneration) {
      cacheSkewData(key, result.data);
    }
    console.log('✅ Volatility skew data fetched:', result.data);
    return result.data as SkewData;
  })();

  inFlightRequests.set(key, request);
  const clearInFlight = () => {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key);
    }
  };
  void request.then(clearInFlight, clearInFlight);

  return request;
}

/**
 * Clears the shared skew cache. Exported for focused tests and explicit session resets.
 */
export function clearVolatilitySkewCache() {
  cacheGeneration += 1;
  skewCache.clear();
  inFlightRequests.clear();
}

/**
 * Hook for fetching and managing volatility skew data via REST API.
 *
 * Fetches per-strike implied volatility for a specific expiration,
 * showing the volatility smile/skew pattern.
 */
export function useVolatilitySkew(): UseVolatilitySkewReturn {
  const [skewData, setSkewData] = useState<SkewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchSkewData = useCallback(async (
    symbol: string,
    expiration: string,
    options: FetchSkewOptions = {},
  ): Promise<SkewData | null> => {
    if (!symbol || symbol.trim() === '') {
      requestIdRef.current += 1;
      setSkewData(null);
      setError('Symbol is required');
      setLoading(false);
      return null;
    }

    if (!expiration || expiration.trim() === '') {
      requestIdRef.current += 1;
      setSkewData(null);
      setError('Expiration date is required');
      setLoading(false);
      return null;
    }

    const normalized = normalizeRequest(symbol, expiration);
    const key = getCacheKey(normalized.symbol, normalized.expiration);
    const cached = getCachedEntry(key);
    const isFresh = cached && isCachedEntryFresh(cached);
    const requestId = ++requestIdRef.current;
    const shouldPreserveCurrent = (data: SkewData) =>
      options.preserveCurrentOnNoQuotes && isNoQuoteSkewData(data);

    if (isFresh) {
      if (!shouldPreserveCurrent(cached.data)) {
        setSkewData(cached.data);
      }
      setError(null);
      setLoading(false);
      return cached.data;
    }

    // A stale entry is still useful while refreshing. For a new cycle, the
    // previous chart stays visible until its replacement is ready.
    if (cached && !shouldPreserveCurrent(cached.data)) {
      setSkewData(cached.data);
    }
    setLoading(true);
    setError(null);

    try {
      const data = await requestSkewData(normalized.symbol, normalized.expiration);
      if (requestId === requestIdRef.current) {
        if (!shouldPreserveCurrent(data)) {
          setSkewData(data);
        }
        setError(null);
      }
      return data;
    } catch (err) {
      if (requestId !== requestIdRef.current) return null;

      const message = err instanceof Error ? err.message : 'Failed to fetch volatility skew';
      console.error('Volatility skew fetch error:', err);
      setError(message);
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const prefetchSkewData = useCallback(async (
    symbol: string,
    expiration: string,
  ): Promise<SkewData | null> => {
    if (!symbol.trim() || !expiration.trim()) return null;

    const normalized = normalizeRequest(symbol, expiration);
    try {
      return await requestSkewData(normalized.symbol, normalized.expiration);
    } catch (err) {
      // Prefetching is opportunistic and must not replace the active chart with
      // an error state.
      console.warn('Volatility skew prefetch failed:', err);
      return null;
    }
  }, []);

  const clearSkewData = useCallback(() => {
    requestIdRef.current += 1;
    setSkewData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => () => {
    // Do not abort shared requests: a completed response can still warm the
    // cache for another component or a later hover.
    requestIdRef.current += 1;
  }, []);

  return {
    skewData,
    loading,
    error,
    fetchSkewData,
    prefetchSkewData,
    clearSkewData,
  };
}
