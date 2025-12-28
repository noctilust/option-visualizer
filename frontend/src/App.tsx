import { useEffect, useRef, lazy, Suspense } from 'react';
import { Sun, Moon, RotateCcw, TrendingUp, Loader2 } from 'lucide-react';
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
import ProbabilityMetrics from './components/ProbabilityMetrics';
import DateSelector from './components/DateSelector';

// Components - Lazy loaded (only when Greeks are shown)
const GreeksChart = lazy(() => import('./components/GreeksChart'));
const GreeksVisualization = lazy(() => import('./components/GreeksVisualization'));

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
    probabilityMetrics,
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
          {/* Step 1: Stock Symbol */}
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
                  <span>IV Rank powered by Tastytrade - Price data may be delayed up to 15 minutes</span>
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
              <h2 className="text-xl font-semibold mb-4">2. Add Positions</h2>
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

          {/* Loading indicator - granular states */}
          {(loadingStates.chart || loadingStates.greeks) && positions.length > 0 && credit && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-muted-foreground">
                  {loadingStates.chart && loadingStates.greeks && 'Calculating P/L and Greeks...'}
                  {loadingStates.chart && !loadingStates.greeks && 'Calculating P/L...'}
                  {!loadingStates.chart && loadingStates.greeks && 'Loading Greeks data...'}
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full animate-pulse transition-all"
                  style={{ width: loadingStates.chart ? '60%' : '90%' }}
                />
              </div>
            </div>
          )}

          {/* Analysis Section */}
          {chartData.length > 0 && (
            <div
              ref={analysisSectionRef}
              className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">5. Analysis</h2>
                <div className="flex items-center gap-4">
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
                  <button
                    onClick={handleStartOver}
                    className="flex items-center justify-center gap-1.5 min-w-[140px] px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
                  >
                    <RotateCcw size={14} />
                    Start Over
                  </button>
                </div>
              </div>

              <PLChart
                chartData={chartData}
                positions={positions}
                marketData={marketData}
                zoomRange={zoomRange}
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

              {/* Probability Metrics Section */}
              {probabilityMetrics && (
                <div className="mt-8 pt-8 border-t">
                  <ProbabilityMetrics probabilityMetrics={probabilityMetrics} />
                </div>
              )}

              {/* Greeks Chart Section */}
              {showGreeks && portfolioGreeks && (
                <div className="mt-8 pt-8 border-t">
                  <Suspense fallback={
                    <div className="flex items-center justify-center gap-2 py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">Loading Greeks Chart...</span>
                    </div>
                  }>
                    <GreeksChart portfolioGreeks={portfolioGreeks} />
                  </Suspense>
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
