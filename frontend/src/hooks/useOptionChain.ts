import { useState, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface ExpirationData {
  value: string;      // ISO format YYYY-MM-DD
  label: string;      // Display label like "Jan 17"
  isWeekly: boolean;  // true if weekly, false if monthly (3rd Friday)
  daysToExpiration: number;
}

interface OptionChainData {
  expirations: ExpirationData[];
  strikesByExpiration: Record<string, number[]>;
  underlyingPrice: number | null;
}

interface UseOptionChainReturn {
  chainData: OptionChainData | null;
  loading: boolean;
  error: string | null;
  fetchOptionChain: (symbol: string) => Promise<void>;
  clearOptionChain: () => void;
}

/**
 * Check if a date is standard monthly opex (3rd Friday)
 */
function isMonthlyOpex(dateStr: string): boolean {
  // Parse as local date to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  // Find 3rd Friday of the month
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();
  const firstFriday = (5 - firstDayOfWeek + 7) % 7 + 1;
  const thirdFriday = firstFriday + 14;

  return date.getDate() === thirdFriday;
}

/**
 * Hook for fetching option chain data (expirations and strikes) from Tastytrade API.
 */
export function useOptionChain(): UseOptionChainReturn {
  const [chainData, setChainData] = useState<OptionChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, { data: OptionChainData; timestamp: number }>>({});

  const fetchOptionChain = useCallback(async (symbol: string) => {
    if (!symbol || symbol.trim() === '') {
      setChainData(null);
      setError('Symbol is required');
      return;
    }

    const upperSymbol = symbol.toUpperCase();
    const now = Date.now();
    const cached = cacheRef.current[upperSymbol];

    // Use cache if less than 5 minutes old
    if (cached && now - cached.timestamp < 5 * 60 * 1000) {
      setChainData(cached.data);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/option-chain/${upperSymbol}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to fetch option chain: ${response.status}`);
      }

      const result = await response.json();
      const rawExpirations: string[] = result.expirations || [];
      const strikesByExpiration: Record<string, number[]> = result.strikes_by_expiration || {};
      const underlyingPrice: number | null = result.underlying_price || null;

      // Transform expirations to include display info
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day

      const expirations: ExpirationData[] = rawExpirations
        .filter(exp => {
          // Parse as local date to avoid timezone issues
          const [year, month, day] = exp.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          return date > today;
        })
        .map(exp => {
          // Parse as local date to avoid timezone issues
          const [year, month, day] = exp.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const daysToExp = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const isWeekly = !isMonthlyOpex(exp);

          return {
            value: exp,
            label,
            isWeekly,
            daysToExpiration: daysToExp,
          };
        })
        .sort((a, b) => a.daysToExpiration - b.daysToExpiration);

      const data: OptionChainData = {
        expirations,
        strikesByExpiration,
        underlyingPrice,
      };

      // Cache the result
      cacheRef.current[upperSymbol] = { data, timestamp: now };

      console.log(`✅ Option chain fetched for ${upperSymbol}: ${expirations.length} expirations`);
      setChainData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch option chain';
      console.error('Option chain fetch error:', err);
      setError(message);
      setChainData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearOptionChain = useCallback(() => {
    setChainData(null);
    setError(null);
  }, []);

  return {
    chainData,
    loading,
    error,
    fetchOptionChain,
    clearOptionChain,
  };
}
