import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import type {
  Position,
  ChartDataPoint,
  PositionWithGreeks,
  PortfolioGreeks,
  MarketData,
  CalculateResponse,
  ProbabilityMetrics,
  SellerMetrics,
  IvScenarioBase,
} from '../types';
import { createStore, type Store } from '../utils/store';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UseCalculationProps {
  symbol: string;
  marketData: MarketData | null;
  setMarketData: (data: MarketData | null) => void;
  profitTargetPct?: number;
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
  evalDaysFromNow: number | null;
  setEvalDaysFromNow: (days: number | null) => void;
  maxDaysToExpiration: number | null;
  precomputedDates: Record<number, number[]> | null;
  probabilityMetrics: ProbabilityMetrics | null;
  sellerMetrics: SellerMetrics | null;
  ivShiftPct: number;
  setIvShiftPct: (pct: number) => void;
  ivPreviewStore: Store<number>;
  ivScenarioBase: IvScenarioBase | null;
  uploadResetKey: number;
  handleFileSelect: (file: File | null) => Promise<void>;
  handleManualEntry: () => void;
  handleStartOver: () => void;
  arePositionsValid: (positions: Position[]) => boolean;
}

// Generate unique ID for positions
export function generateId(): string {
  return `pos_${Math.random().toString(36).substring(2, 9)}`;
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
  const firstFriday = 1 + ((5 - firstDay.getDay() + 7) % 7);
  const thirdFriday = firstFriday + 14;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[targetMonth]} ${thirdFriday} ${String(targetYear).slice(-2)}`;
}

export const DEFAULT_EXPIRATION = getDefaultExpiration();

/** Credit field value for a market credit (dollars; negative = debit). */
export function creditFieldFromMarket(netCredit: number): { credit: string; isDebit: boolean } {
  return { credit: Math.abs(netCredit).toFixed(2), isDebit: netCredit < 0 };
}

export function useCalculation({
  symbol,
  marketData,
  setMarketData,
  profitTargetPct = 50,
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
  const [showGreeks, setShowGreeks] = useState(true);
  const [greeksData, setGreeksData] = useState<PositionWithGreeks[] | null>(null);
  const [portfolioGreeks, setPortfolioGreeks] = useState<PortfolioGreeks | null>(null);

  // P/L at different dates state (default to today = 0)
  const [evalDaysFromNow, setEvalDaysFromNow] = useState<number | null>(0);
  const [maxDaysToExpiration, setMaxDaysToExpiration] = useState<number | null>(null);
  const [precomputedDates, setPrecomputedDates] = useState<Record<number, number[]> | null>(null);

  // Seller metrics and IV scenario (percent change applied to pre-expiration curves)
  const [probabilityMetrics, setProbabilityMetrics] = useState<ProbabilityMetrics | null>(null);
  const [sellerMetrics, setSellerMetrics] = useState<SellerMetrics | null>(null);
  const [ivShiftPct, setCommittedIvShiftPct] = useState(0);
  // Live slider value; the chart previews it client-side until the recalculation lands
  const [ivPreviewStore] = useState(() => createStore(0));
  const [ivScenarioBase, setIvScenarioBase] = useState<IvScenarioBase | null>(null);

  const setIvShiftPct = useCallback((pct: number) => {
    ivPreviewStore.set(pct);
    setCommittedIvShiftPct(pct);
  }, [ivPreviewStore]);

  // Strategy fingerprint whose credit was already filled from market quotes
  const autoFilledCreditRef = useRef<string | null>(null);

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

    // Create abort controller with 30 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Upload failed');
      }

      const data = await response.json();

      if (!data.positions || data.positions.length === 0) {
        throw new Error('No positions found in image');
      }

      setPositions(data.positions.map((pos: Omit<Position, 'id'>) => ({ ...pos, id: generateId() })));
      toast.success(`Parsed ${data.positions.length} position(s) from image`);
    } catch (err) {
      console.error(err);

      let message = 'Failed to parse image';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          message = 'Upload timed out. Please try a smaller image.';
        } else {
          message = err.message;
        }
      }

      setError(message + '. Please try again or enter manually.');
      toast.error(message);
    } finally {
      clearTimeout(timeoutId);
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
    setProbabilityMetrics(null);
    setSellerMetrics(null);
    setIvShiftPct(0);
    setIvScenarioBase(null);
    autoFilledCreditRef.current = null;
    setError(null);
    setUploadResetKey(prev => prev + 1);
    toast('Strategy cleared', { icon: '🔄' });
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

    const strategyKey = `${symbol.toUpperCase()}::${positions
      .map(p => `${p.qty}-${p.strike}-${p.type}-${p.expiration}`)
      .sort()
      .join('|')}`;

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
          eval_days_from_now?: number;
          precompute_dates?: boolean;
          iv_shift: number;
          profit_target_pct: number;
        } = {
          positions: positions,
          credit: creditValue,
          skip_greeks_curve: !showGreeks,
          iv_shift: ivShiftPct / 100,
          profit_target_pct: profitTargetPct,
        };

        // Add Black-Scholes parameters if symbol is provided
        if (symbol && symbol.trim() !== '') {
          requestBody.symbol = symbol.toUpperCase();
          requestBody.use_theoretical_pricing = useTheoreticalPricing;
          // Request pre-computed date curves for faster slider interaction
          requestBody.precompute_dates = true;
        }

        // Add eval_days_from_now if set (for P/L at different dates)
        if (evalDaysFromNow !== null) {
          requestBody.eval_days_from_now = evalDaysFromNow;
        }

        // Generate cache key from request parameters
        // Note: exclude eval_days_from_now since we use precomputed_dates client-side
        const cacheKey = JSON.stringify({
          positions: requestBody.positions,
          credit: requestBody.credit,
          skip_greeks_curve: requestBody.skip_greeks_curve,
          symbol: requestBody.symbol,
          use_theoretical_pricing: requestBody.use_theoretical_pricing,
          precompute_dates: requestBody.precompute_dates,
          iv_shift: requestBody.iv_shift,
          profit_target_pct: requestBody.profit_target_pct,
        });

        const applyResponse = (data: CalculateResponse) => {
          setChartData(data.data || []);
          setGreeksData(data.positions_with_greeks || null);
          setPortfolioGreeks(data.portfolio_greeks || null);
          setProbabilityMetrics(data.probability_metrics || null);
          setSellerMetrics(data.seller_metrics || null);
          if (data.market_data) {
            setMarketData(data.market_data);
          }
          if (data.max_days_to_expiration !== undefined) {
            setMaxDaysToExpiration(data.max_days_to_expiration);
          }
          if (data.precomputed_dates) {
            setPrecomputedDates(data.precomputed_dates);
          }
          const riskFreeRate = data.market_data?.risk_free_rate;
          setIvScenarioBase(data.scenario_legs && riskFreeRate !== undefined
            ? { positions, legs: data.scenario_legs, ivShiftPct: Math.round((data.iv_shift ?? 0) * 100), riskFreeRate }
            : null);

          // Pre-fill an empty credit field once per strategy from the market mid
          const marketCredit = data.seller_metrics?.market_credit;
          if (marketCredit && credit === '' && autoFilledCreditRef.current !== strategyKey) {
            autoFilledCreditRef.current = strategyKey;
            const filled = creditFieldFromMarket(marketCredit.mid);
            setCredit(filled.credit);
            setIsDebit(filled.isDebit);
          }
        };

        // Check if request is already in progress or cached
        if (requestCacheRef.current.has(cacheKey)) {
          console.log('💾 Cache hit - reusing existing request');
          const cachedPromise = requestCacheRef.current.get(cacheKey)!;
          const data = await cachedPromise;

          applyResponse(data);

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

        applyResponse(data);

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

        // Show user-friendly error toast (throttled to avoid spam)
        const message = err instanceof Error ? err.message : 'Calculation failed';
        if (message.includes('fetch') || message.includes('network')) {
          toast.error('Network error. Check your connection.');
        } else if (message.includes('timeout')) {
          toast.error('Request timed out. Try again.');
        } else {
          toast.error(`Calculation failed: ${message}`);
        }
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
    // Note: evalDaysFromNow is excluded - slider changes use precomputed_dates client-side
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, credit, isDebit, symbol, useTheoreticalPricing, showGreeks, arePositionsValid, ivShiftPct, profitTargetPct]);

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
    evalDaysFromNow,
    setEvalDaysFromNow,
    maxDaysToExpiration,
    precomputedDates,
    probabilityMetrics,
    sellerMetrics,
    ivShiftPct,
    setIvShiftPct,
    ivPreviewStore,
    ivScenarioBase,
    uploadResetKey,
    handleFileSelect,
    handleManualEntry,
    handleStartOver,
    arePositionsValid,
  };
}
