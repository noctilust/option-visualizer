import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import UploadSection from './components/UploadSection';
import InputSection from './components/InputSection';
import PositionsTable, { generateId } from './components/PositionsTable';
import GreeksChart from './components/GreeksChart';
import GreeksVisualization from './components/GreeksVisualization';
import ProbabilityMetrics from './components/ProbabilityMetrics';
import SymbolAutocomplete from './components/SymbolAutocomplete';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { Plus, Minus, RotateCcw, Sun, Moon, TrendingUp, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function App() {
  const [credit, setCredit] = useState('');
  const [isDebit, setIsDebit] = useState(false);
  const [positions, setPositions] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [zoomRange, setZoomRange] = useState({ startIndex: 0, endIndex: 0 });
  const [uploadResetKey, setUploadResetKey] = useState(0);

  // Drag-to-pan state
  const chartContainerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef({ startIndex: 0, endIndex: 0 });

  // Black-Scholes / Greeks state
  const [symbol, setSymbol] = useState('');
  const [marketData, setMarketData] = useState(null);
  const [loadingMarketData, setLoadingMarketData] = useState(false);
  const [useTheoreticalPricing, setUseTheoreticalPricing] = useState(true);
  const [showGreeks, setShowGreeks] = useState(true);
  const [greeksData, setGreeksData] = useState(null);
  const [portfolioGreeks, setPortfolioGreeks] = useState(null);
  const [probabilityMetrics, setProbabilityMetrics] = useState(null);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'light';
      // If system, check current and go opposite
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'light' : 'dark';
    });
  };

  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Expose mock data loader for testing (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.loadMockData = () => {
        setPositions([
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'P' },
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'C' }
        ]);
        setCredit('1750');
        setIsDebit(false);
        console.log('Mock data loaded');
      };
    }
  }, []);

  // Reset zoom when chart data changes, with smart default based on profit zone
  useEffect(() => {
    if (chartData.length > 0) {
      // Find profit zone indices
      const firstProfitIndex = chartData.findIndex(d => d.pl > 0);
      const lastProfitIndex = chartData.findLastIndex(d => d.pl > 0);

      if (firstProfitIndex !== -1 && lastProfitIndex !== -1) {
        const profitWidth = lastProfitIndex - firstProfitIndex;
        const padding = Math.floor(profitWidth * 0.5); // 50% padding on each side

        const startIndex = Math.max(0, firstProfitIndex - padding);
        const endIndex = Math.min(chartData.length - 1, lastProfitIndex + padding);

        setZoomRange({ startIndex, endIndex });
      } else if (positions.length > 0) {
        // Fallback to strike-based zoom if no profit zone (e.g., all loss)
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);

        // Tighter buffer for fallback
        const lowerBound = minStrike * 0.9;
        const upperBound = maxStrike * 1.1;

        const startIndex = chartData.findIndex(d => d.price >= lowerBound);
        const endIndex = chartData.findIndex(d => d.price >= upperBound);

        setZoomRange({
          startIndex: startIndex !== -1 ? startIndex : 0,
          endIndex: endIndex !== -1 ? endIndex : chartData.length - 1
        });
      } else {
        setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
      }
    }
  }, [chartData, positions]);

  const xAxisTicks = useMemo(() => {
    if (!chartData.length) return [];

    const start = zoomRange.startIndex;
    const end = zoomRange.endIndex || chartData.length - 1;
    const visibleData = chartData.slice(start, end + 1);

    if (!visibleData.length) return [];

    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const range = maxPrice - minPrice;
    if (range === 0) return [minPrice];

    // Target roughly 8 ticks
    const rawInterval = range / 8;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;

    let interval;
    if (normalized < 1.5) interval = 1 * magnitude;
    else if (normalized < 3.5) interval = 2 * magnitude; // 2 or 2.5
    else if (normalized < 7.5) interval = 5 * magnitude;
    else interval = 10 * magnitude;

    const startTick = Math.floor(minPrice / interval) * interval;
    const endTick = Math.ceil(maxPrice / interval) * interval;

    const ticks = [];
    for (let p = startTick; p <= endTick; p += interval) {
      ticks.push(p);
    }
    return ticks;
  }, [chartData, zoomRange]);

  const handleFileSelect = async (selectedFile) => {
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
      setPositions(data.positions.map(pos => ({ ...pos, id: generateId() })));
    } catch (err) {
      console.error(err);
      setError('Failed to upload and parse image. Please try again or enter manually.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    setPositions([{ id: generateId(), qty: -1, expiration: '', strike: 0, type: 'P' }]);
  };

  // Fetch market data when symbol changes
  useEffect(() => {
    const fetchMarketData = async () => {
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
    };

    const timeoutId = setTimeout(fetchMarketData, 300); // Debounce (faster response)
    return () => clearTimeout(timeoutId);
  }, [symbol]);

  useEffect(() => {
    const calculatePL = async () => {
      console.log('🔄 Calculate triggered:', {
        positionsCount: positions.length,
        credit: credit,
        symbol: symbol,
        hasMarketData: !!marketData,
        creditValue: credit ? parseFloat(credit) : 'empty'
      });

      // Only require positions to calculate - credit defaults to 0
      if (positions.length === 0) {
        console.log('❌ Skipping calculation - no positions');
        setChartData([]);
        setGreeksData(null);
        setPortfolioGreeks(null);
        setProbabilityMetrics(null);
        return;
      }

      setCalculating(true);
      try {
        let creditValue = parseFloat(credit) || 0;
        if (isDebit) {
          creditValue = -creditValue;
        }

        const requestBody = {
          positions: positions,
          credit: creditValue,
        };

        // Add Black-Scholes parameters if symbol is provided
        if (symbol && symbol.trim() !== '') {
          requestBody.symbol = symbol.toUpperCase();
          requestBody.use_theoretical_pricing = useTheoreticalPricing;
        }

        const response = await fetch(`${API_BASE}/calculate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) throw new Error('Calculation failed');

        const data = await response.json();
        console.log('📊 Calculation response:', {
          dataPoints: data.data?.length || 0,
          hasGreeks: !!data.portfolio_greeks,
          hasMarketData: !!data.market_data,
          hasProbMetrics: !!data.probability_metrics
        });

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
      } catch (err) {
        console.error('❌ Calculation error:', err);
        // Don't show error here to avoid spamming while typing
      } finally {
        setCalculating(false);
      }
    };

    const timeoutId = setTimeout(() => {
      calculatePL();
    }, 300); // Debounce

    return () => clearTimeout(timeoutId);
  }, [positions, credit, isDebit, symbol, useTheoreticalPricing]);

  const breakevenPoints = useMemo(() => {
    if (!chartData.length) return [];
    const points = [];
    for (let i = 0; i < chartData.length - 1; i++) {
      const p1 = chartData[i];
      const p2 = chartData[i + 1];
      if ((p1.pl >= 0 && p2.pl < 0) || (p1.pl < 0 && p2.pl >= 0)) {
        // Linear interpolation for more accurate x position
        const x = p1.price + (p2.price - p1.price) * ((0 - p1.pl) / (p2.pl - p1.pl));
        points.push({ x, y: 0 });
      }
    }
    return points;
  }, [chartData]);

  // Compute visible chart data based on zoom range with profit/loss split
  const visibleChartData = useMemo(() => {
    if (!chartData.length) return [];
    const start = zoomRange.startIndex;
    const end = zoomRange.endIndex || chartData.length - 1;
    return chartData.slice(start, end + 1).map(d => ({
      ...d,
      profit: d.pl > 0 ? d.pl : 0,
      loss: d.pl < 0 ? d.pl : 0
    }));
  }, [chartData, zoomRange]);

  const handleStartOver = () => {
    setCredit('');
    setIsDebit(false);
    setPositions([]);
    setChartData([]);
    setError(null);
    setUploadResetKey(prev => prev + 1);
  };

  const handleZoomIn = () => {
    const { startIndex, endIndex } = zoomRange;
    const range = endIndex - startIndex;
    if (range <= 2) return; // Prevent zooming in too much

    const zoomFactor = Math.floor(range * 0.1) || 1; // Zoom in by 10% or at least 1 step
    const newStart = Math.min(startIndex + zoomFactor, endIndex - 2);
    const newEnd = Math.max(endIndex - zoomFactor, startIndex + 2);

    setZoomRange({ startIndex: newStart, endIndex: newEnd });
  };

  const handleZoomOut = () => {
    const { startIndex, endIndex } = zoomRange;
    const totalPoints = chartData.length;
    const range = endIndex - startIndex;

    // If already fully zoomed out, do nothing
    if (startIndex === 0 && endIndex === totalPoints - 1) return;

    const zoomFactor = Math.floor(range * 0.1) || 1; // Zoom out by 10%
    const newStart = Math.max(0, startIndex - zoomFactor);
    const newEnd = Math.min(totalPoints - 1, endIndex + zoomFactor);

    setZoomRange({ startIndex: newStart, endIndex: newEnd });
  };

  const handleResetZoom = () => {
    if (chartData.length > 0) {
      // Find profit zone indices (same logic as initial load)
      const firstProfitIndex = chartData.findIndex(d => d.pl > 0);
      const lastProfitIndex = chartData.findLastIndex(d => d.pl > 0);

      if (firstProfitIndex !== -1 && lastProfitIndex !== -1) {
        const profitWidth = lastProfitIndex - firstProfitIndex;
        const padding = Math.floor(profitWidth * 0.5); // 50% padding on each side

        const startIndex = Math.max(0, firstProfitIndex - padding);
        const endIndex = Math.min(chartData.length - 1, lastProfitIndex + padding);

        setZoomRange({ startIndex, endIndex });
      } else if (positions.length > 0) {
        // Fallback to strike-based zoom if no profit zone
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);

        const lowerBound = minStrike * 0.9;
        const upperBound = maxStrike * 1.1;

        const startIdx = chartData.findIndex(d => d.price >= lowerBound);
        const endIdx = chartData.findIndex(d => d.price >= upperBound);

        setZoomRange({
          startIndex: startIdx !== -1 ? startIdx : 0,
          endIndex: endIdx !== -1 ? endIdx : chartData.length - 1
        });
      } else {
        setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
      }
    }
  };

  // Drag-to-pan handlers
  const handleChartMouseDown = useCallback((e) => {
    e.preventDefault(); // Prevent native drag/selection behavior
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = { ...zoomRange };

    // Change cursor to grabbing
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grabbing';
    }
  }, [zoomRange]);

  const handleChartMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX = e.clientX - dragStartXRef.current;
    const chartWidth = rect.width;

    // Calculate how many data points to shift based on drag distance
    const { startIndex: startIdx, endIndex: endIdx } = dragStartRangeRef.current;
    const visibleRange = endIdx - startIdx;

    // Pixels per data point
    const pixelsPerPoint = chartWidth / visibleRange;

    // Calculate shift amount (negative because dragging left should show higher prices)
    const shift = Math.round(-deltaX / pixelsPerPoint);

    // Calculate new range with bounds checking
    const totalPoints = chartData.length;
    let newStart = startIdx + shift;
    let newEnd = endIdx + shift;

    // Clamp to valid range
    if (newStart < 0) {
      newEnd = newEnd - newStart;
      newStart = 0;
    }
    if (newEnd > totalPoints - 1) {
      newStart = newStart - (newEnd - (totalPoints - 1));
      newEnd = totalPoints - 1;
    }

    // Ensure we don't go out of bounds
    newStart = Math.max(0, newStart);
    newEnd = Math.min(totalPoints - 1, newEnd);

    if (newStart !== zoomRange.startIndex || newEnd !== zoomRange.endIndex) {
      setZoomRange({ startIndex: newStart, endIndex: newEnd });
    }
  }, [chartData.length, zoomRange]);

  const handleChartMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Theme Toggle Button */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full bg-card border border-border hover:bg-muted transition-colors shadow-sm"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun size={20} className="text-yellow-500" />
            ) : (
              <Moon size={20} className="text-slate-700" />
            )}
          </button>
        </div>

        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Option Premium Visualizer
          </h1>
          <p className="text-muted-foreground text-lg">
            Visualize your P/L from option strategies instantly.
          </p>
        </header>

        <main className="space-y-4">
          {/* Step 1: Stock Symbol - Primary entry point */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
            <h2 className="text-xl font-semibold mb-4">1. Stock Symbol</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="symbol" className="block text-sm font-medium mb-2">
                  Enter the underlying stock ticker
                </label>
                <SymbolAutocomplete
                  value={symbol}
                  onChange={setSymbol}
                  placeholder="Search for a stock or ETF..."
                />
              </div>

              {loadingMarketData && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Fetching market data...
                </p>
              )}

              {marketData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/30 rounded-lg p-3 border">
                  <div>
                    <div className="text-xs text-muted-foreground">Current Price</div>
                    <div className="text-lg font-semibold">${marketData.current_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Implied Volatility</div>
                    <div className="text-lg font-semibold">{(marketData.implied_volatility * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">IV Rank</div>
                    <div className={`text-lg font-semibold ${marketData.iv_rank !== null && marketData.iv_rank !== undefined
                      ? marketData.iv_rank < 30
                        ? 'text-green-600 dark:text-green-400'
                        : marketData.iv_rank > 70
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                      : ''
                      }`}>
                      {marketData.iv_rank !== null && marketData.iv_rank !== undefined
                        ? `${marketData.iv_rank.toFixed(0)}%`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Risk-Free Rate</div>
                    <div className="text-lg font-semibold">{(marketData.risk_free_rate * 100).toFixed(2)}%</div>
                  </div>
                </div>
              )}

              {/* Data delay disclaimer */}
              {marketData && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>IV Rank powered by Tastytrade • Price data may be delayed up to 15 minutes</span>
                </div>
              )}

              {/* Pricing Mode Toggle */}
              {symbol && symbol.trim() !== '' && (
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useTheoreticalPricing}
                      onChange={(e) => setUseTheoreticalPricing(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">
                      Use Advanced Pricing (Black-Scholes for European, Binomial for American)
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Add Positions - Only show after market data is fetched */}
          {symbol && symbol.trim() !== '' && marketData && marketData.iv_rank !== null && marketData.iv_rank !== undefined ? (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-semibold mb-4">2. Add Positions</h2>
              <UploadSection onFileSelect={handleFileSelect} onManualEntry={handleManualEntry} resetKey={uploadResetKey} />
              {loading && <p className="text-center text-muted-foreground animate-pulse">Processing image...</p>}
              {error && <p className="text-center text-destructive">{error}</p>}
            </div>
          ) : (
            !symbol || symbol.trim() === '' ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-6 md:p-8 text-center">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <p className="text-muted-foreground">
                  Enter a stock symbol above to continue
                </p>
              </div>
            ) : loadingMarketData ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-6 md:p-8 text-center">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading market data...</p>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-6 md:p-8 text-center">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <p className="text-muted-foreground">
                  Unable to fetch market data for "{symbol}". Please try a different symbol.
                </p>
              </div>
            )
          )}

          {positions.length > 0 && (
            <>
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-semibold mb-4">3. Verify Positions</h2>
                <PositionsTable
                  positions={positions}
                  setPositions={setPositions}
                  greeksData={greeksData}
                  showGreeks={showGreeks && portfolioGreeks !== null}
                />
              </div>

              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                <h2 className="text-xl font-semibold mb-4">4. Enter Amount</h2>
                <InputSection credit={credit} setCredit={setCredit} isDebit={isDebit} setIsDebit={setIsDebit} />
              </div>
            </>
          )}

          {/* Loading indicator between input and analysis */}
          {calculating && positions.length > 0 && credit && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-muted-foreground">Calculating P/L and fetching market data...</span>
              </div>
              <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">5. Analysis</h2>
                <div className="flex items-center gap-4">
                  {portfolioGreeks && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showGreeks}
                        onChange={(e) => setShowGreeks(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm flex items-center gap-1">
                        <TrendingUp size={14} />
                        Show Greeks
                      </span>
                    </label>
                  )}
                  <button
                    onClick={handleStartOver}
                    className="flex items-center justify-center gap-1.5 min-w-[140px] px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
                  >
                    <RotateCcw size={14} />
                    Start Over
                  </button>
                </div>
              </div>

              <div
                ref={chartContainerRef}
                className="h-[420px] w-full select-none"
                style={{ cursor: 'grab' }}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseLeave}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleChartData} margin={{ top: 20, right: 0, left: 0, bottom: 10 }}>
                    <CartesianGrid stroke="#525252" vertical={false} />
                    {/* Vertical grid lines at even prices with lighter gray */}
                    {xAxisTicks.map((tick, index) => (
                      <ReferenceLine
                        key={`grid-${index}`}
                        x={tick}
                        stroke="#9ca3af"
                        strokeDasharray="3 3"
                        strokeOpacity={0.4}
                      />
                    ))}
                    <XAxis
                      dataKey="price"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      ticks={xAxisTicks}
                      allowDecimals={false}
                      stroke="#666"
                      tick={false}
                      axisLine={{ stroke: '#525252' }}
                      tickLine={{ stroke: '#525252' }}
                    />
                    <YAxis
                      stroke="#666"
                      tick={false}
                      width={0}
                      domain={(() => {
                        if (!visibleChartData.length) return ['auto', 'auto'];

                        const plValues = visibleChartData.map(d => d.pl);
                        const maxPL = Math.max(...plValues);
                        const minPL = Math.min(...plValues);
                        const range = maxPL - minPL;

                        // Ensure we don't have a 0 range
                        if (range === 0) return [minPL - 10, maxPL + 10];

                        // Add 10% padding on each side
                        const padding = range * 0.1;
                        return [minPL - padding, maxPL + padding];
                      })()}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          // Get the actual P/L value from the data point
                          const plValue = payload[0].payload.pl;
                          // Check if P/L is exactly 0 (breakeven point)
                          const isBreakeven = plValue === 0;
                          // Check if this price matches any position's strike
                          const matchingPositions = positions.filter(
                            pos => Math.abs(pos.strike - label) < 0.5
                          );
                          return (
                            <div className="bg-[#262626] border border-[#404040] text-[#e5e5e5] rounded-lg p-3 shadow-lg">
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <span className="text-gray-400">Price:</span>
                                <span className="text-right font-medium">
                                  ${Number.isInteger(label) ? label : label.toFixed(2)}
                                </span>
                                <span className="text-gray-400">P/L:</span>
                                <span className={`text-right font-medium ${plValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  ${plValue}
                                </span>
                                {isBreakeven && (
                                  <span className="col-span-2 text-center text-emerald-400 font-semibold mt-1 pt-1 border-t border-[#404040]">
                                    Breakeven
                                  </span>
                                )}
                                {matchingPositions.length > 0 && (
                                  <div className="col-span-2 mt-1 pt-1 border-t border-[#404040]">
                                    {matchingPositions.map((pos, idx) => (
                                      <div key={idx} className="flex items-center justify-between gap-3 mt-1">
                                        <span className={`font-semibold ${pos.qty > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {pos.qty > 0 ? '+' : ''}{pos.qty} {pos.type === 'C' ? 'Call' : 'Put'}
                                        </span>
                                        <span className="text-gray-400 text-xs">
                                          ${pos.strike} {pos.expiration}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={0} stroke="#525252" strokeWidth={2} />
                    {/* Price labels just above the zero line */}
                    {xAxisTicks.map((tick, index) => (
                      <ReferenceDot
                        key={`price-label-${index}`}
                        x={tick}
                        y={0}
                        r={0}
                        label={{
                          content: ({ viewBox }) => {
                            const { x, y } = viewBox;
                            return (
                              <text
                                x={x}
                                y={y - 6}
                                textAnchor="middle"
                                fill={isDark ? '#9ca3af' : '#6b7280'}
                                fontSize={11}
                              >
                                ${Math.round(tick)}
                              </text>
                            );
                          }
                        }}
                      />
                    ))}
                    {/* Position flag markers at strike prices */}
                    {positions.map((pos, index) => {
                      const flagText = `${pos.qty > 0 ? '+' : ''}${pos.qty}${pos.type}`;
                      return (
                        <ReferenceDot
                          key={`strike-${index}`}
                          x={pos.strike}
                          y={0}
                          r={0}
                          label={{
                            content: ({ viewBox }) => {
                              const { x, y } = viewBox;
                              const boxWidth = flagText.length * 7 + 10;
                              const boxHeight = 16;
                              return (
                                <g>
                                  {/* Small flag background */}
                                  <rect
                                    x={x - boxWidth / 2}
                                    y={y + 4}
                                    width={boxWidth}
                                    height={boxHeight}
                                    fill={isDark ? '#1f2937' : '#f3f4f6'}
                                    stroke={isDark ? '#374151' : '#d1d5db'}
                                    strokeWidth={1}
                                    rx={2}
                                    ry={2}
                                  />
                                  {/* Left accent bar */}
                                  <rect
                                    x={x - boxWidth / 2}
                                    y={y + 4}
                                    width={3}
                                    height={boxHeight}
                                    fill={pos.qty > 0 ? '#10b981' : '#ef4444'}
                                    rx={2}
                                    ry={0}
                                  />
                                  {/* Flag text */}
                                  <text
                                    x={x + 2}
                                    y={y + 16}
                                    textAnchor="middle"
                                    fill={isDark ? '#f9fafb' : '#111827'}
                                    fontSize={10}
                                    fontWeight={500}
                                  >
                                    {flagText}
                                  </text>
                                </g>
                              );
                            }
                          }}
                        />
                      );
                    })}
                    {/* Breakeven points */}
                    {breakevenPoints.map((point, index) => (
                      <ReferenceDot
                        key={`breakeven-${index}`}
                        x={point.x}
                        y={point.y}
                        r={4}
                        fill="#10b981"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                    {/* Current stock price indicator */}
                    {marketData?.current_price && (
                      <>
                        <ReferenceLine
                          x={marketData.current_price}
                          stroke="#10b981"
                          strokeWidth={1}
                          strokeDasharray="4 2"
                        />
                        <ReferenceDot
                          x={marketData.current_price}
                          y={0}
                          r={0}
                          label={{
                            content: ({ viewBox }) => {
                              const { x, y } = viewBox;
                              return (
                                <g>
                                  {/* Green dot on x-axis */}
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={4}
                                    fill="#10b981"
                                    stroke="#fff"
                                    strokeWidth={2}
                                  />
                                  {/* Price label below dot */}
                                  <text
                                    x={x}
                                    y={y + 18}
                                    textAnchor="middle"
                                    fill={isDark ? '#10b981' : '#059669'}
                                    fontSize={11}
                                    fontWeight={600}
                                  >
                                    ${marketData.current_price.toFixed(2)}
                                  </text>
                                </g>
                              );
                            }
                          }}
                        />
                      </>
                    )}
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.3}
                      strokeWidth={3}
                      baseValue={0}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="loss"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.3}
                      strokeWidth={3}
                      baseValue={0}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center gap-2 -mt-8 relative z-10">
                <button
                  onClick={handleZoomIn}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Zoom In"
                >
                  <Plus size={18} />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Zoom Out"
                >
                  <Minus size={18} />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Reset Zoom"
                >
                  <RotateCcw size={18} />
                </button>
              </div>

              {/* Probability Metrics Section */}
              {probabilityMetrics && (
                <div className="mt-8 pt-8 border-t">
                  <ProbabilityMetrics probabilityMetrics={probabilityMetrics} />
                </div>
              )}

              {/* Greeks Chart Section */}
              {showGreeks && portfolioGreeks && (
                <div className="mt-8 pt-8 border-t">
                  <GreeksChart portfolioGreeks={portfolioGreeks} />
                </div>
              )}

              {/* Greeks Visualization Section */}
              {showGreeks && chartData.length > 0 && (
                <div className="mt-8 pt-8 border-t">
                  <GreeksVisualization
                    chartData={chartData}
                    portfolioGreeks={portfolioGreeks}
                    marketData={marketData}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
