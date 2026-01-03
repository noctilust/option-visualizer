import { useState, useCallback } from 'react';
import type { SmileData } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UseVolatilitySmileReturn {
  smileData: SmileData | null;
  loading: boolean;
  error: string | null;
  fetchSmileData: (symbol: string, expiration: string) => Promise<void>;
  clearSmileData: () => void;
}

/**
 * Hook for fetching and managing volatility smile data via REST API.
 *
 * Fetches per-strike implied volatility for a specific expiration,
 * showing the volatility smile/skew pattern.
 */
export function useVolatilitySmile(): UseVolatilitySmileReturn {
  const [smileData, setSmileData] = useState<SmileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSmileData = useCallback(async (symbol: string, expiration: string) => {
    if (!symbol || symbol.trim() === '') {
      setSmileData(null);
      setError('Symbol is required');
      return;
    }

    if (!expiration || expiration.trim() === '') {
      setSmileData(null);
      setError('Expiration date is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/volatility-smile/${symbol.toUpperCase()}?expiration=${encodeURIComponent(expiration)}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to fetch volatility smile: ${response.status}`);
      }

      const result = await response.json();

      if (result.data) {
        console.log('✅ Volatility smile data fetched:', result.data);
        setSmileData(result.data);
      } else {
        setSmileData(null);
        setError('No smile data available');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch volatility smile';
      console.error('Volatility smile fetch error:', err);
      setError(message);
      setSmileData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSmileData = useCallback(() => {
    setSmileData(null);
    setError(null);
  }, []);

  return {
    smileData,
    loading,
    error,
    fetchSmileData,
    clearSmileData,
  };
}
