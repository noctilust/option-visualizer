import { useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import { Sun, Moon, RotateCcw, TrendingUp, Loader2, DollarSign, Activity, BarChart3, Percent } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

// Hooks
import { useTheme } from './hooks/useTheme';
import { useMarketData } from './hooks/useMarketData';
import { useCalculation, generateId } from './hooks/useCalculation';
import { useChartZoom } from './hooks/useChartZoom';

// Components - Always loaded
import UploadSection from './components/UploadSection';
import InputSection from './components/InputSection';
import PositionsTable from './components/PositionsTable';
import SymbolAutocomplete from './components/SymbolAutocomplete';
import PLChart from './components/PLChart';
import DateSelector from './components/DateSelector';
import { VolatilitySkew } from './components/VolatilitySkew';
import StepProgress from './components/StepProgress';
import { MarketDataCardSkeleton, ChartSkeleton, GreeksCardSkeleton } from './components/Skeleton';
import HelpTooltip from './components/HelpTooltip';
import Button from './components/Button';
import Collapsible from './components/Collapsible';
import StickyHeader from './components/StickyHeader';

// Components - Lazy loaded (only when Greeks are shown)
const GreeksChart = lazy(() => import('./components/GreeksChart'));
const GreeksVisualization = lazy(() => import('./components/GreeksVisualization'));

/**
 * Parse position expiration format (e.g., "Dec 19 25" or "Dec 19") to ISO date (YYYY-MM-DD)
 *
 * Handles year logic:
 * - If year is provided (e.g., "Dec 19 25"), use that year (2025)
 * - If no year (e.g., "Jan 16"), use current year
 * - If resulting date is in the past, increment to next year
 */
function parsePositionExpiration(expiration: string): string | null {
  if (!expiration) return null;

  try {
    // Format: "Dec 19 25" or "Dec 19"
    const parts = expiration.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const monthStr = parts[0];
    const dayStr = parts[1];
    const currentYear = new Date().getFullYear();
    const yearStr = parts[2] || currentYear.toString().slice(-2);

    // Convert month name to number
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const month = months[monthStr];
    if (month === undefined) return null;

    const day = parseInt(dayStr, 10);
    let year = 2000 + parseInt(yearStr, 10);

    const date = new Date(year, month, day);
    const now = new Date();

    // If date is in the past and no explicit year was provided, use next year
    if (date < now && parts.length < 3) {
      year += 1;
      const newDate = new Date(year, month, day);
      return newDate.toISOString().split('T')[0];
    }

    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function App() {
  // Theme hook
  const { isDark, toggleTheme } = useTheme();

  // Market data hook
  const {
    symbol,
    setSymbol,
    marketData,
    setMarketData,
    loadingMarketData,
  } = useMarketData();

  // Calculation hook
  const {
    positions,
    setPositions,
    credit,
    setCredit,
    isDebit,
    setIsDebit,
    chartData,
    loadingStates,
    loading,
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
    uploadResetKey,
    handleFileSelect,
    handleManualEntry,
    handleStartOver,
  } = useCalculation({ symbol, marketData, setMarketData });

  // Chart zoom hook
  const {
    zoomRange,
    deferredZoomRange,
    chartContainerRef,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleChartMouseDown,
    handleChartMouseMove,
    handleChartMouseUp,
    handleChartMouseLeave,
    xAxisTicks,
  } = useChartZoom({ chartData, positions });

  // Ref for scrolling to analysis section
  const analysisSectionRef = useRef<HTMLDivElement>(null);
  const prevChartDataLengthRef = useRef(0);

  // Get primary expiration from positions for volatility smile
  // Use the most common expiration, or first position's expiration
  const primaryExpiration = useMemo(() => {
    if (positions.length === 0) return '';

    // Count expirations
    const expirationCounts = new Map<string, number>();
    for (const pos of positions) {
      const parsed = parsePositionExpiration(pos.expiration);
      if (parsed) {
        expirationCounts.set(parsed, (expirationCounts.get(parsed) || 0) + 1);
      }
    }

    if (expirationCounts.size === 0) {
      // Fallback: try to parse first position
      return parsePositionExpiration(positions[0].expiration) || '';
    }

    // Return most common expiration
    let maxCount = 0;
    let mostCommon = '';
    for (const [exp, count] of expirationCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = exp;
      }
    }
    return mostCommon;
  }, [positions]);

  // Scroll to analysis section when chart data is first rendered
  useEffect(() => {
    if (chartData.length > 0 && prevChartDataLengthRef.current === 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        analysisSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
    }
    prevChartDataLengthRef.current = chartData.length;
  }, [chartData.length]);

  // Expose mock data loader for testing (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { loadMockData: () => void }).loadMockData = () => {
        setPositions([
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'P' },
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'C' }
        ]);
        setCredit('1750');
        setIsDebit(false);
        console.log('Mock data loaded');
      };
    }
  }, [setPositions, setCredit, setIsDebit]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Skip to main content link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sticky header on mobile when scrolling */}
      <StickyHeader
        symbol={symbol}
        currentPrice={marketData?.current_price}
        show={!!symbol && !!marketData}
      />

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: isDark ? '#1f2937' : '#ffffff',
            color: isDark ? '#f3f4f6' : '#1f2937',
            border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
          },
          success: {
            duration: 3000,
            iconTheme: { primary: '#10b981', secondary: '#ffffff' },
          },
          error: {
            duration: 5000,
            iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          },
        }}
      />
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Theme Toggle Button */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full bg-card border border-border hover:bg-muted transition-colors shadow-sm"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun size={20} className="text-yellow-500" aria-hidden="true" />
            ) : (
              <Moon size={20} className="text-slate-700" aria-hidden="true" />
            )}
          </button>
        </div>

        <header className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Option Strategy Visualizer
          </h1>
          <p className="text-muted-foreground text-lg mb-6">
            Visualize P/L, Greeks, and volatility for any option strategy.
          </p>

          {/* Step Progress Indicator */}
          <StepProgress
            currentStep={chartData.length > 0 ? 5 : positions.length > 0 && credit ? 4 : positions.length > 0 ? 3 : marketData ? 2 : symbol ? 1 : 0}
            totalSteps={5}
            steps={[
              { label: 'Symbol', completed: !!symbol && !!marketData },
              { label: 'Positions', completed: positions.length > 0 },
              { label: 'Verify', completed: positions.length > 0 },
              { label: 'Amount', completed: !!credit },
              { label: 'Analysis', completed: chartData.length > 0 },
            ]}
          />
        </header>

        <main id="main-content" className="space-y-6" tabIndex={-1}>
          {/* Step 1: Stock Symbol */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
            <h2 className="text-xl font-semibold mb-1">1. Stock Symbol</h2>
            <p className="text-sm text-muted-foreground mb-4">Enter the ticker of the underlying stock or ETF for your options strategy.</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="symbol" className="block text-sm font-medium mb-2">
                  Enter the underlying stock ticker
                </label>
                <SymbolAutocomplete
                  value={symbol}
                  onChange={setSymbol}
                  loading={loadingMarketData}
                  placeholder="Search for a stock or ETF..."
                />
              </div>

              {/* Market Data Loading Skeleton */}
              {loadingMarketData && symbol && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <MarketDataCardSkeleton />
                  <MarketDataCardSkeleton />
                  <MarketDataCardSkeleton />
                  <MarketDataCardSkeleton />
                </div>
              )}

              {marketData && !loadingMarketData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {/* Current Price */}
                  <div className="rounded-lg bg-card border border-border px-3 py-2.5 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground font-medium">Current Price</span>
                    </div>
                    <div className="text-lg font-semibold text-foreground">${marketData.current_price.toFixed(2)}</div>
                  </div>

                  {/* Implied Volatility */}
                  <div className="rounded-lg bg-card border border-border px-3 py-2.5 hover:border-blue-500/30 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="w-3.5 h-3.5 text-blue-500" />
                      <HelpTooltip term="iv">
                        <span className="text-xs text-muted-foreground font-medium">Implied Volatility</span>
                      </HelpTooltip>
                    </div>
                    <div className="text-lg font-semibold text-foreground">{(marketData.implied_volatility * 100).toFixed(1)}%</div>
                  </div>

                  {/* IV Rank */}
                  <div className={`rounded-lg px-3 py-2.5 border transition-colors ${
                    marketData.iv_rank !== null && marketData.iv_rank !== undefined
                      ? marketData.iv_rank < 30
                        ? 'bg-card border-emerald-500/20 hover:border-emerald-500/40'
                        : marketData.iv_rank > 70
                          ? 'bg-card border-red-500/20 hover:border-red-500/40'
                          : 'bg-card border-yellow-500/20 hover:border-yellow-500/40'
                      : 'bg-card border-border hover:border-border/80'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <BarChart3 className={`w-3.5 h-3.5 ${
                        marketData.iv_rank !== null && marketData.iv_rank !== undefined
                          ? marketData.iv_rank < 30
                            ? 'text-emerald-500'
                            : marketData.iv_rank > 70
                              ? 'text-red-500'
                              : 'text-yellow-500'
                          : 'text-muted-foreground'
                      }`} />
                      <HelpTooltip term="iv-rank">
                        <span className="text-xs text-muted-foreground font-medium">IV Rank</span>
                      </HelpTooltip>
                    </div>
                    <div className={`text-lg font-semibold ${
                      marketData.iv_rank !== null && marketData.iv_rank !== undefined
                        ? marketData.iv_rank < 30
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : marketData.iv_rank > 70
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                        : 'text-foreground'
                    }`}>
                      {marketData.iv_rank !== null && marketData.iv_rank !== undefined
                        ? `${marketData.iv_rank.toFixed(0)}%`
                        : 'N/A'}
                    </div>
                  </div>

                  {/* Risk-Free Rate */}
                  <div className="rounded-lg bg-card border border-border px-3 py-2.5 hover:border-purple-500/30 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Percent className="w-3.5 h-3.5 text-purple-500" />
                      <HelpTooltip term="risk-free-rate">
                        <span className="text-xs text-muted-foreground font-medium">Risk-Free Rate</span>
                      </HelpTooltip>
                    </div>
                    <div className="text-lg font-semibold text-foreground">{(marketData.risk_free_rate * 100).toFixed(2)}%</div>
                  </div>
                </div>
              )}

              {/* Data disclaimer */}
              {marketData && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    IV Rank and market data powered by Tastytrade API
                  </span>
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

          {/* Step 2: Add Positions */}
          {symbol && symbol.trim() !== '' && marketData && marketData.iv_rank !== null && marketData.iv_rank !== undefined ? (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-semibold mb-1">2. Add Positions</h2>
              <p className="text-sm text-muted-foreground mb-4">Build your strategy by adding option positions (calls, puts) or upload a screenshot.</p>
              <UploadSection
                onFileSelect={handleFileSelect}
                onManualEntry={handleManualEntry}
                resetKey={uploadResetKey}
                loading={loading}
                onClearError={() => setError(null)}
              />
              {loading && <p className="text-center text-muted-foreground animate-pulse">Processing image...</p>}
              {error && <p className="text-center text-destructive">{error}</p>}
            </div>
          ) : (
            !symbol || symbol.trim() === '' ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-4 md:p-5">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <p className="text-sm text-muted-foreground">
                  Enter a stock symbol above to continue
                </p>
              </div>
            ) : loadingMarketData ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-4 md:p-5">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading market data...</p>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 border border-dashed border-border rounded-xl shadow-sm p-4 md:p-5">
                <h2 className="text-xl font-semibold mb-2 text-muted-foreground">2. Add Positions</h2>
                <p className="text-sm text-muted-foreground">
                  Unable to fetch market data for "{symbol}". Please try a different symbol.
                </p>
              </div>
            )
          )}

          {positions.length > 0 && (
            <>
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">3. Verify Positions</h2>
                    <p className="text-sm text-muted-foreground">Review and edit your positions before calculating P/L and Greeks.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-muted/30 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={showGreeks}
                      onChange={(e) => setShowGreeks(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm flex items-center gap-1">
                      <TrendingUp size={14} />
                      <span className="hidden sm:inline">Show Greeks</span>
                      <span className="sm:hidden">Greeks</span>
                    </span>
                  </label>
                </div>
                <PositionsTable
                  positions={positions}
                  setPositions={setPositions}
                  greeksData={greeksData}
                  showGreeks={showGreeks && portfolioGreeks !== null}
                  isDark={isDark}
                  symbol={symbol}
                />
              </div>

              {/* Volatility Skew - Market context for selected expiration */}
              {symbol && marketData && primaryExpiration && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                  <div className="md:hidden">
                    <Collapsible
                      title="Volatility Skew"
                      icon={<TrendingUp className="w-5 h-5 text-primary" />}
                      defaultOpen={false}
                      className="bg-card border border-border rounded-xl shadow-sm p-4"
                    >
                      <VolatilitySkew
                        symbol={symbol}
                        marketData={marketData}
                        selectedExpiration={primaryExpiration}
                        isDark={isDark}
                      />
                    </Collapsible>
                  </div>
                  <div className="hidden md:block">
                    <VolatilitySkew
                      symbol={symbol}
                      marketData={marketData}
                      selectedExpiration={primaryExpiration}
                      isDark={isDark}
                    />
                  </div>
                </div>
              )}

              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                <h2 className="text-xl font-semibold mb-1">4. Enter Amount</h2>
                <p className="text-sm text-muted-foreground mb-4">Enter the credit received or debit paid to open this position.</p>
                <InputSection credit={credit} setCredit={setCredit} isDebit={isDebit} setIsDebit={setIsDebit} />
              </div>
            </>
          )}

          {/* Loading indicator - skeleton chart */}
          {(loadingStates.chart || loadingStates.greeks) && positions.length > 0 && credit && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold mb-1">5. P/L Analysis</h2>
                <p className="text-sm text-muted-foreground mb-4">View profit/loss projections, Greeks, and volatility analysis for your strategy.</p>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {loadingStates.chart && loadingStates.greeks && 'Calculating P/L and Greeks...'}
                    {loadingStates.chart && !loadingStates.greeks && 'Calculating P/L...'}
                    {!loadingStates.chart && loadingStates.greeks && 'Loading Greeks data...'}
                  </span>
                </div>
              </div>
              <ChartSkeleton />
            </div>
          )}

          {/* Analysis Section */}
          {chartData.length > 0 && (
            <div
              ref={analysisSectionRef}
              className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">5. P/L Analysis</h2>
                  <p className="text-sm text-muted-foreground">View profit/loss projections, Greeks, and volatility analysis for your strategy.</p>
                </div>
                <Button
                  onClick={handleStartOver}
                  leftIcon={<RotateCcw size={14} />}
                  className="min-w-[140px]"
                >
                  Start Over
                </Button>
              </div>

              <PLChart
                chartData={chartData}
                positions={positions}
                marketData={marketData}
                zoomRange={deferredZoomRange}
                xAxisTicks={xAxisTicks}
                isDark={isDark}
                chartContainerRef={chartContainerRef}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetZoom={handleResetZoom}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseLeave}
                evalDaysFromNow={evalDaysFromNow}
                precomputedDates={precomputedDates}
              />

              {/* Date Selector for P/L at different dates */}
              {maxDaysToExpiration !== null && maxDaysToExpiration > 0 && (
                <div className="mt-6">
                  <DateSelector
                    evalDaysFromNow={evalDaysFromNow}
                    setEvalDaysFromNow={setEvalDaysFromNow}
                    maxDaysToExpiration={maxDaysToExpiration}
                  />
                </div>
              )}

              {/* Greeks Chart Section */}
              {showGreeks && portfolioGreeks && (
                <div className="mt-8 pt-8 border-t">
                  <Collapsible
                    title="Position Greeks"
                    icon={<TrendingUp className="w-5 h-5 text-primary" />}
                    mobileOnly
                    defaultOpen
                  >
                    <Suspense fallback={
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm text-muted-foreground">Loading Greeks...</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <GreeksCardSkeleton />
                          <GreeksCardSkeleton />
                          <GreeksCardSkeleton />
                          <GreeksCardSkeleton />
                        </div>
                      </div>
                    }>
                      <GreeksChart portfolioGreeks={portfolioGreeks} />
                    </Suspense>
                  </Collapsible>
                </div>
              )}

              {/* Greeks Visualization Section */}
              {showGreeks && chartData.length > 0 && (
                <div className="mt-8 pt-8 border-t">
                  <Suspense fallback={
                    <div className="flex items-center justify-center gap-2 py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">Loading Greeks Visualization...</span>
                    </div>
                  }>
                    <GreeksVisualization
                      chartData={chartData}
                      portfolioGreeks={portfolioGreeks}
                      marketData={marketData}
                    />
                  </Suspense>
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
