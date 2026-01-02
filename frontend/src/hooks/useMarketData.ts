import { useState, useEffect, useCallback } from 'react';
import type { MarketData } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UseMarketDataReturn {
  symbol: string;
  setSymbol: (symbol: string) => void;
  marketData: MarketData | null;
  setMarketData: (data: MarketData | null) => void;
  loadingMarketData: boolean;
}

/**
 * Hook for fetching and managing market data via REST API.
 *
 * Note: Streaming functionality was removed as Tastytrade API is used via REST only.
 * Market data is fetched on-demand and cached by the backend.
 */
export function useMarketData(): UseMarketDataReturn {
  const [symbol, setSymbol] = useState('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarketData, setLoadingMarketData] = useState(false);

  /**
   * Fetch market data via REST API
   */
  const fetchMarketData = useCallback(async () => {
    if (!symbol || symbol.trim() === '') {
      setMarketData(null);
      return;
    }

    setLoadingMarketData(true);
    try {
      const response = await fetch(`${API_BASE}/market-data/${symbol.toUpperCase()}`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Market data fetched:', data);
        setMarketData(data);
      } else {
        console.warn('Failed to fetch market data for', symbol);
        setMarketData(null);
      }
    } catch (err) {
      console.error('Market data fetch error:', err);
      setMarketData(null);
    } finally {
      setLoadingMarketData(false);
    }
  }, [symbol]);

  // Fetch market data when symbol changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(fetchMarketData, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [fetchMarketData]);

  return {
    symbol,
    setSymbol,
    marketData,
    setMarketData,
    loadingMarketData,
  };
}
