import { useState, useCallback } from 'react';
import type { SkewData } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UseVolatilitySkewReturn {
  skewData: SkewData | null;
  loading: boolean;
  error: string | null;
  fetchSkewData: (symbol: string, expiration: string) => Promise<void>;
  clearSkewData: () => void;
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

  const fetchSkewData = useCallback(async (symbol: string, expiration: string) => {
    if (!symbol || symbol.trim() === '') {
      setSkewData(null);
      setError('Symbol is required');
      return;
    }

    if (!expiration || expiration.trim() === '') {
      setSkewData(null);
      setError('Expiration date is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/volatility-skew/${symbol.toUpperCase()}?expiration=${encodeURIComponent(expiration)}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to fetch volatility skew: ${response.status}`);
      }

      const result = await response.json();

      if (result.data) {
        console.log('✅ Volatility skew data fetched:', result.data);
        setSkewData(result.data);
      } else {
        setSkewData(null);
        setError('No skew data available');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch volatility skew';
      console.error('Volatility skew fetch error:', err);
      setError(message);
      setSkewData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSkewData = useCallback(() => {
    setSkewData(null);
    setError(null);
  }, []);

  return {
    skewData,
    loading,
    error,
    fetchSkewData,
    clearSkewData,
  };
}
