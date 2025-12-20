import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Position,
  ChartDataPoint,
  PositionWithGreeks,
  PortfolioGreeks,
  ProbabilityMetrics,
  MarketData,
  CalculateResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UseCalculationProps {
  symbol: string;
  marketData: MarketData | null;
  setMarketData: (data: MarketData | null) => void;
}

interface UseCalculationReturn {
  positions: Position[];
  setPositions: React.Dispatch<React.SetStateAction<Position[]>>;
  credit: string;
  setCredit: (credit: string) => void;
  isDebit: boolean;
  setIsDebit: (isDebit: boolean) => void;
  chartData: ChartDataPoint[];
  setChartData: React.Dispatch<React.SetStateAction<ChartDataPoint[]>>;
  loadingStates: { chart: boolean; greeks: boolean };
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  useTheoreticalPricing: boolean;
  setUseTheoreticalPricing: (use: boolean) => void;
  showGreeks: boolean;
  setShowGreeks: (show: boolean) => void;
  greeksData: PositionWithGreeks[] | null;
  portfolioGreeks: PortfolioGreeks | null;
  probabilityMetrics: ProbabilityMetrics | null;
  uploadResetKey: number;
  handleFileSelect: (file: File | null) => Promise<void>;
  handleManualEntry: () => void;
  handleStartOver: () => void;
  arePositionsValid: (positions: Position[]) => boolean;
}

// Generate unique ID for positions
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Calculate default expiration (3rd Friday of next month)
function getDefaultExpiration(): string {
  const today = new Date();
  let targetMonth = today.getMonth() + 1;
  let targetYear = today.getFullYear();

  if (targetMonth > 11) {
    targetMonth = 0;
    targetYear++;
  }

  // Find 3rd Friday
  const firstDay = new Date(targetYear, targetMonth, 1);
  let firstFriday = 1 + ((5 - firstDay.getDay() + 7) % 7);
  const thirdFriday = firstFriday + 14;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[targetMonth]} ${thirdFriday} ${String(targetYear).slice(-2)}`;
}

export const DEFAULT_EXPIRATION = getDefaultExpiration();

export function useCalculation({
  symbol,
  marketData,
  setMarketData,
}: UseCalculationProps): UseCalculationReturn {
  const [credit, setCredit] = useState('');
  const [isDebit, setIsDebit] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Granular loading states
  const [loadingStates, setLoadingStates] = useState({
    chart: false,
    greeks: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  // Black-Scholes / Greeks state
  const [useTheoreticalPricing, setUseTheoreticalPricing] = useState(true);
  const [showGreeks, setShowGreeks] = useState(false);
  const [greeksData, setGreeksData] = useState<PositionWithGreeks[] | null>(null);
  const [portfolioGreeks, setPortfolioGreeks] = useState<PortfolioGreeks | null>(null);
  const [probabilityMetrics, setProbabilityMetrics] = useState<ProbabilityMetrics | null>(null);

  // Calculation in-progress guard to prevent concurrent calls
  const calculationInProgressRef = useRef(false);

  // AbortController ref for cancelling stale requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track positions fingerprint to detect significant strategy changes
  const positionsFingerprintRef = useRef<string>('');

  // Request cache to deduplicate identical API calls
  const requestCacheRef = useRef<Map<string, Promise<CalculateResponse>>>(new Map());

  // Validate positions are complete before sending to backend
  const arePositionsValid = useCallback((positions: Position[]): boolean => {
    return positions.every(pos =>
      pos.strike > 0 &&
      pos.expiration && pos.expiration.trim() !== '' &&
      pos.type && (pos.type === 'C' || pos.type === 'P') &&
      pos.qty !== 0
    );
  }, []);

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setPositions(data.positions.map((pos: Omit<Position, 'id'>) => ({ ...pos, id: generateId() })));
    } catch (err) {
      console.error(err);
      setError('Failed to upload and parse image. Please try again or enter manually.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    setPositions([{ id: generateId(), qty: -1, expiration: DEFAULT_EXPIRATION, strike: 0, type: 'P' }]);
  };

  const handleStartOver = () => {
    setCredit('');
    setIsDebit(false);
    setPositions([]);
    setChartData([]);
    setError(null);
    setUploadResetKey(prev => prev + 1);
  };

  // Main calculation effect
  useEffect(() => {
    // Skip setup entirely if no positions (prevents initial page load trigger)
    if (positions.length === 0) {
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const calculatePL = async () => {
      // Check if this request was cancelled before it started
      if (abortController.signal.aborted) {
        console.log('⏭️  Skipping - request was cancelled');
        return;
      }

      console.log('🔄 Calculate triggered:', {
        positionsCount: positions.length,
        credit: credit,
        symbol: symbol,
        hasMarketData: !!marketData,
        creditValue: credit ? parseFloat(credit) : 'empty'
      });

      // Skip calculation if positions are incomplete (prevents 422 errors)
      if (!arePositionsValid(positions)) {
        console.log('⏸️  Skipping calculation - incomplete positions');
        setLoadingStates({ chart: false, greeks: false });
        return;
      }

      calculationInProgressRef.current = true;
      setLoadingStates({ chart: true, greeks: showGreeks });

      try {
        let creditValue = parseFloat(credit) || 0;
        if (isDebit) {
          creditValue = -creditValue;
        }

        const requestBody: {
          positions: Position[];
          credit: number;
          skip_greeks_curve: boolean;
          symbol?: string;
          use_theoretical_pricing?: boolean;
        } = {
          positions: positions,
          credit: creditValue,
          skip_greeks_curve: !showGreeks,
        };

        // Add Black-Scholes parameters if symbol is provided
        if (symbol && symbol.trim() !== '') {
          requestBody.symbol = symbol.toUpperCase();
          requestBody.use_theoretical_pricing = useTheoreticalPricing;
        }

        // Generate cache key from request parameters
        const cacheKey = JSON.stringify({
          positions: requestBody.positions,
          credit: requestBody.credit,
          skip_greeks_curve: requestBody.skip_greeks_curve,
          symbol: requestBody.symbol,
          use_theoretical_pricing: requestBody.use_theoretical_pricing
        });

        // Check if request is already in progress or cached
        if (requestCacheRef.current.has(cacheKey)) {
          console.log('💾 Cache hit - reusing existing request');
          const cachedPromise = requestCacheRef.current.get(cacheKey)!;
          const data = await cachedPromise;

          // Update state with cached data
          setChartData(data.data || []);
          setGreeksData(data.positions_with_greeks || null);
          setPortfolioGreeks(data.portfolio_greeks || null);
          setProbabilityMetrics(data.probability_metrics || null);
          if (data.market_data) {
            setMarketData(data.market_data);
          }

          console.log('✅ Cache data applied');
          setLoadingStates({ chart: false, greeks: false });
          calculationInProgressRef.current = false;
          return;
        }

        // Create new request promise and cache it
        const requestPromise = fetch(`${API_BASE}/calculate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        })
          .then(async (response) => {
            if (!response.ok) throw new Error('Calculation failed');
            return response.json() as Promise<CalculateResponse>;
          })
          .then((data) => {
            console.log('📊 Calculation response:', {
              dataPoints: data.data?.length || 0,
              hasGreeks: !!data.portfolio_greeks,
              hasMarketData: !!data.market_data,
              hasProbMetrics: !!data.probability_metrics
            });
            return data;
          })
          .catch((err) => {
            // Remove from cache on error
            requestCacheRef.current.delete(cacheKey);
            throw err;
          });

        // Store in cache
        requestCacheRef.current.set(cacheKey, requestPromise);

        // Await the request
        const data = await requestPromise;

        setChartData(data.data || []);

        // Set Greeks data if available
        setGreeksData(data.positions_with_greeks || null);
        setPortfolioGreeks(data.portfolio_greeks || null);
        setProbabilityMetrics(data.probability_metrics || null);

        // Also set market data from calculation response if available
        if (data.market_data) {
          setMarketData(data.market_data);
        }

        console.log('✅ State updated - chartData length:', data.data?.length || 0);

        // Update loading states - chart is done, greeks might still be loading
        setLoadingStates(prev => ({ ...prev, chart: false }));
      } catch (err) {
        // Ignore abort errors - these are expected when cancelling stale requests
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('🛑 Request aborted (newer request in progress)');
          return;
        }
        console.error('❌ Calculation error:', err);
        // Don't show error here to avoid spamming while typing
      } finally {
        // Only update loading states if this request wasn't aborted
        if (!abortController.signal.aborted) {
          setLoadingStates({ chart: false, greeks: false });
        }
        calculationInProgressRef.current = false;
      }
    };

    // Generate positions fingerprint to detect significant strategy changes
    const newFingerprint = positions.map(p => `${p.strike}-${p.type}`).sort().join('|');
    if (newFingerprint !== positionsFingerprintRef.current) {
      // Strategy changed significantly - clear cache
      requestCacheRef.current.clear();
      positionsFingerprintRef.current = newFingerprint;
      console.log('🔄 Strategy changed, cache cleared');
    }

    // Smart debounce: give users time to finish typing multi-digit numbers
    const isComplete = arePositionsValid(positions);
    const debounceTime = isComplete ? 600 : 1000;

    const timeoutId = setTimeout(() => {
      calculatePL();
    }, debounceTime);

    return () => clearTimeout(timeoutId);
  }, [positions, credit, isDebit, symbol, useTheoreticalPricing, showGreeks, arePositionsValid]);

  return {
    positions,
    setPositions,
    credit,
    setCredit,
    isDebit,
    setIsDebit,
    chartData,
    setChartData,
    loadingStates,
    loading,
    setLoading,
    error,
    setError,
    useTheoreticalPricing,
    setUseTheoreticalPricing,
    showGreeks,
    setShowGreeks,
    greeksData,
    portfolioGreeks,
    probabilityMetrics,
    uploadResetKey,
    handleFileSelect,
    handleManualEntry,
    handleStartOver,
    arePositionsValid,
  };
}
