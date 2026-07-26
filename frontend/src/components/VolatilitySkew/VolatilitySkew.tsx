import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import ExpirationDropdown from '../ExpirationDropdown';
import {
  isNoQuoteSkewData,
  useVolatilitySkew,
} from '../../hooks/useVolatilitySkew';
import type {
  MarketData,
  SkewBasis,
  SkewData,
  SkewDataPoint,
  SkewLegSelection,
} from '../../types';

const loadSkewChart = () => import('./SkewChart');
const SkewChart = lazy(loadSkewChart);
const SKEW_TARGET_DELTA = 0.25;
const SKEW_DELTA_TOLERANCE = 0.05;
const SKEW_ATM_MONEYNESS_TOLERANCE = 0.05;

interface VolatilitySkewProps {
  symbol: string;
  marketData: MarketData | null;
  selectedExpiration: string;
  isDark: boolean;
  onExpirationChange?: (expiration: string) => void;
  embedded?: boolean;
}

interface SkewSummary {
  metric: number | null;
  basis: SkewBasis;
  callSelection: SkewLegSelection | null;
  putSelection: SkewLegSelection | null;
}

interface ResolvedExpirations {
  expirations: string[];
  source: 'api' | 'fallback';
}

function isMonthlyOpex(expiration: string): boolean {
  const [year, month, day] = expiration.split('-').map(Number);
  if (!year || !month || !day) return false;

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const firstFriday = (5 - firstDayOfWeek + 7) % 7 + 1;
  return day === firstFriday + 14;
}

function formatExpirationLabel(expiration: string) {
  const [year, month, day] = expiration.split('-').map(Number);
  if (!year || !month || !day) return expiration;

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function toSelection(
  point: SkewDataPoint,
  optionType: 'call' | 'put',
): SkewLegSelection {
  return {
    strike: point.strike,
    delta: optionType === 'call' ? point.call_delta ?? null : point.put_delta ?? null,
    iv: optionType === 'call' ? point.call_iv as number : point.put_iv as number,
  };
}

function deriveSkewSummary(skewData: SkewData | null): SkewSummary {
  if (!skewData) {
    return {
      metric: null,
      basis: 'unavailable',
      callSelection: null,
      putSelection: null,
    };
  }

  if (
    skewData.skew_basis === '25_delta'
    && skewData.skew_metric !== null
    && skewData.call_selection
    && skewData.put_selection
  ) {
    return {
      metric: skewData.skew_metric,
      basis: '25_delta',
      callSelection: skewData.call_selection,
      putSelection: skewData.put_selection,
    };
  }

  if (skewData.skew_basis === 'atm' && skewData.skew_metric !== null) {
    return {
      metric: skewData.skew_metric,
      basis: 'atm',
      callSelection: skewData.call_selection ?? null,
      putSelection: skewData.put_selection ?? null,
    };
  }

  if (skewData.skew_basis === 'unavailable') {
    return {
      metric: null,
      basis: 'unavailable',
      callSelection: null,
      putSelection: null,
    };
  }

  const callPoint = skewData.points
    .filter(point =>
      point.call_delta !== null
      && point.call_delta !== undefined
      && point.call_iv !== null
      && Math.abs(point.call_delta - SKEW_TARGET_DELTA) <= SKEW_DELTA_TOLERANCE
    )
    .sort((a, b) =>
      Math.abs((a.call_delta as number) - SKEW_TARGET_DELTA)
      - Math.abs((b.call_delta as number) - SKEW_TARGET_DELTA)
    )[0];
  const putPoint = skewData.points
    .filter(point =>
      point.put_delta !== null
      && point.put_delta !== undefined
      && point.put_iv !== null
      && Math.abs(point.put_delta + SKEW_TARGET_DELTA) <= SKEW_DELTA_TOLERANCE
    )
    .sort((a, b) =>
      Math.abs((a.put_delta as number) + SKEW_TARGET_DELTA)
      - Math.abs((b.put_delta as number) + SKEW_TARGET_DELTA)
    )[0];

  if (callPoint && putPoint) {
    return {
      metric: (putPoint.put_iv as number) - (callPoint.call_iv as number),
      basis: '25_delta',
      callSelection: toSelection(callPoint, 'call'),
      putSelection: toSelection(putPoint, 'put'),
    };
  }

  const atmPoint = skewData.points
    .filter(point =>
      point.call_iv !== null
      && point.put_iv !== null
      && skewData.current_price > 0
      && Math.abs(point.strike - skewData.current_price) / skewData.current_price
        <= SKEW_ATM_MONEYNESS_TOLERANCE
    )
    .sort(
      (a, b) =>
        Math.abs(a.strike - skewData.current_price)
        - Math.abs(b.strike - skewData.current_price),
    )[0];

  if (atmPoint) {
    return {
      metric: (atmPoint.put_iv as number) - (atmPoint.call_iv as number),
      basis: 'atm',
      callSelection: toSelection(atmPoint, 'call'),
      putSelection: toSelection(atmPoint, 'put'),
    };
  }

  return {
    metric: null,
    basis: 'unavailable',
    callSelection: null,
    putSelection: null,
  };
}

function ChartLoadingState({ message }: { message: string }) {
  return (
    <div className="h-[350px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}

function VolatilitySkewContent({
  symbol,
  marketData,
  selectedExpiration: propExpiration,
  isDark,
  onExpirationChange,
  embedded = false,
}: VolatilitySkewProps) {
  // Local state for expiration
  const [localExpiration, setLocalExpiration] = useState(propExpiration);
  const [previewExpiration, setPreviewExpiration] = useState<string | null>(null);
  const [
    unavailablePreviewExpiration,
    setUnavailablePreviewExpiration,
  ] = useState<string | null>(null);
  const [resolvedExpirations, setResolvedExpirations] = useState<ResolvedExpirations | null>(null);
  const activeExpiration = previewExpiration ?? localExpiration;

  const {
    skewData,
    loading,
    error,
    fetchSkewData,
    prefetchSkewData,
    clearSkewData,
  } = useVolatilitySkew();

  const handleExpirationsResolved = useCallback((
    expirations: string[],
    source: 'api' | 'fallback',
  ) => {
    setResolvedExpirations(current => {
      if (
        current?.source === source
        && current.expirations.length === expirations.length
        && current.expirations.every((expiration, index) => expiration === expirations[index])
      ) {
        return current;
      }

      return { expirations, source };
    });
  }, []);

  // Warm the lazy chart bundle as soon as a symbol is selected so rendering
  // does not wait on both data and code.
  useEffect(() => {
    if (symbol.trim()) {
      void loadSkewChart();
    }
  }, [symbol]);

  // Fetch skew data when the selected or temporarily previewed expiration changes
  useEffect(() => {
    let cancelled = false;

    if (symbol && activeExpiration && marketData?.current_price) {
      const isPreview = previewExpiration !== null;
      void fetchSkewData(symbol, activeExpiration, {
        preserveCurrentOnNoQuotes: isPreview,
      }).then(data => {
        if (cancelled || !data) {
          return;
        }

        if (isPreview && isNoQuoteSkewData(data)) {
          setUnavailablePreviewExpiration(activeExpiration);
          return;
        }

        setUnavailablePreviewExpiration(null);
        if (
          activeExpiration !== localExpiration
          || resolvedExpirations?.source !== 'api'
        ) {
          return;
        }

        const monthlyExpirations = resolvedExpirations.expirations.filter(isMonthlyOpex);
        const farMonthlyExpiration = monthlyExpirations[1];
        if (farMonthlyExpiration && farMonthlyExpiration !== activeExpiration) {
          void prefetchSkewData(symbol, farMonthlyExpiration);
        }
      });
    } else {
      clearSkewData();
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeExpiration,
    clearSkewData,
    fetchSkewData,
    localExpiration,
    marketData?.current_price,
    prefetchSkewData,
    previewExpiration,
    resolvedExpirations,
    symbol,
  ]);

  const handleExpirationChange = (expiration: string) => {
    setPreviewExpiration(null);
    setUnavailablePreviewExpiration(null);
    setLocalExpiration(expiration);
    if (onExpirationChange) {
      onExpirationChange(expiration);
    }
  };

  const handlePreviewChange = useCallback((expiration: string | null) => {
    setPreviewExpiration(expiration);
    setUnavailablePreviewExpiration(null);
  }, []);

  // Format IV as percentage
  const formatIV = (iv: number) => {
    return (iv * 100).toFixed(1) + '%';
  };

  // Format skew metric
  const formatSkew = (skew: number | null) => {
    if (skew === null) return 'N/A';
    const sign = skew >= 0 ? '+' : '';
    return sign + (skew * 100).toFixed(1) + ' vol pts';
  };

  const skewSummary = deriveSkewSummary(skewData);
  const calculatedSkewMetric = skewSummary.metric;

  return (
    <div className={embedded ? '' : 'bg-card border border-border rounded-lg p-4 md:p-5'}>
      <div className={`flex items-center mb-4 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && (
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            Volatility Skew
          </h2>
        )}

        {/* Expiration Selector */}
        {symbol && (
          <div className="flex items-center gap-2">
            {previewExpiration && (
              <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                Preview
              </span>
            )}
            <ExpirationDropdown
              symbol={symbol}
              value={localExpiration}
              onChange={handleExpirationChange}
              onPreviewChange={handlePreviewChange}
              onExpirationsResolved={handleExpirationsResolved}
              isDark={isDark}
              autoSelectNextMonthly
            />
          </div>
        )}
      </div>

      {unavailablePreviewExpiration && (
        <div
          role="status"
          className="mx-auto mb-4 flex max-w-md items-center justify-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          No Tastytrade quote data available for{' '}
          {formatExpirationLabel(unavailablePreviewExpiration)}.
        </div>
      )}

      {/* Put-call IV spread badge and gauge */}
      {skewData && (
        <div className="mb-4 flex flex-col items-center gap-3">
          {/* Badge */}
          <div className="flex flex-col items-center gap-1.5 bg-muted px-4 py-2 rounded-lg text-sm border border-border">
            <div className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">
                {skewSummary.basis === '25_delta'
                  ? '25Δ Put–Call IV Spread'
                  : skewSummary.basis === 'atm'
                    ? 'ATM Put–Call IV Spread'
                    : 'Put–Call IV Spread'}
              </span>
              <span className={`font-semibold tabular-nums ${
                calculatedSkewMetric === null
                  ? 'text-muted-foreground'
                  : calculatedSkewMetric > 0
                    ? 'text-negative'
                    : calculatedSkewMetric < 0
                      ? 'text-positive'
                      : 'text-foreground'
              }`}>
                {calculatedSkewMetric === null ? 'Unavailable' : formatSkew(calculatedSkewMetric)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Put IV − Call IV</span>
            {skewSummary.basis === '25_delta'
              && skewSummary.callSelection
              && skewSummary.putSelection && (
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Call: ${skewSummary.callSelection.strike} · Δ {skewSummary.callSelection.delta?.toFixed(3)}
                  </span>
                  <span>
                    Put: ${skewSummary.putSelection.strike} · Δ {skewSummary.putSelection.delta?.toFixed(3)}
                  </span>
                </div>
              )}
            {skewSummary.basis === 'atm' && skewSummary.callSelection && (
              <span className="text-xs text-muted-foreground">
                ATM fallback at nearest strike ${skewSummary.callSelection.strike}
              </span>
            )}
            {skewSummary.basis === 'unavailable' && (
              <span className="text-xs text-muted-foreground">
                No qualifying 25Δ pair or paired ATM IV is available.
              </span>
            )}
          </div>

          {/* Skew Gauge */}
          {calculatedSkewMetric !== null && (
            <div className="w-full max-w-md">
            {/* Labels */}
              <div className="flex justify-between text-xs mb-1">
                <span className={`font-medium ${calculatedSkewMetric < 0 ? 'text-positive' : 'text-muted-foreground'}`}>
                  ← Calls Richer
                </span>
                <span className="text-muted-foreground">Balanced</span>
                <span className={`font-medium ${calculatedSkewMetric > 0 ? 'text-negative' : 'text-muted-foreground'}`}>
                  Puts Richer →
                </span>
              </div>

              {/* Gauge Bar */}
              <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-positive/25 via-muted to-negative/25">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/50" />

                {/* Skew indicator - position based on skew_metric, clamped to -0.1 to +0.1 range */}
                <div
                  className="absolute top-0 bottom-0 w-1 rounded-full transition-all duration-300"
                  style={{
                    left: `${50 + Math.max(-50, Math.min(50, calculatedSkewMetric * 500))}%`,
                    transform: 'translateX(-50%)',
                    backgroundColor: calculatedSkewMetric > 0
                      ? (isDark ? '#f87171' : '#dc2626')
                      : calculatedSkewMetric < 0
                        ? (isDark ? '#34d399' : '#059669')
                        : '#8a8a8a',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && !skewData && (
        <ChartLoadingState message="Fetching volatility skew data..." />
      )}

      {/* Error State */}
      {error && !loading && !skewData && (
        <div className="h-[350px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-md text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {skewData && (
        <div className="relative">
          <Suspense fallback={<ChartLoadingState message="Preparing volatility chart..." />}>
            <SkewChart data={skewData} isDark={isDark} />
          </Suspense>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/75 backdrop-blur-[1px]">
              <div
                role="status"
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading {formatExpirationLabel(activeExpiration)}…
              </div>
            </div>
          )}

          {error && !loading && (
            <div
              role="alert"
              className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              Refresh failed; showing the most recently cached chart.
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 rounded"
                style={{ backgroundColor: isDark ? '#34d399' : '#059669' }}
              />
              <span className="text-muted-foreground">Calls</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 rounded"
                style={{ backgroundColor: isDark ? '#f87171' : '#dc2626' }}
              />
              <span className="text-muted-foreground">Puts</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-dashed"
                style={{
                  backgroundColor: isDark ? '#f59e0b' : '#d97706',
                  borderColor: isDark ? '#f59e0b' : '#d97706',
                }}
              />
              <span className="text-muted-foreground">
                ATM ({formatIV(skewData.atm_iv)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-0.5 rounded"
                style={{
                  backgroundColor: isDark ? '#60a5fa' : '#3b82f6',
                  borderStyle: 'dashed',
                  backgroundImage: `linear-gradient(to right, ${isDark ? '#60a5fa' : '#3b82f6'} 50%, transparent 50%)`,
                  backgroundSize: '8px 100%',
                }}
              />
              <span className="text-muted-foreground">
                Current Price (${marketData?.current_price?.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !skewData && (
        <div className="h-[350px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <TrendingUp className="w-12 h-12 opacity-50" />
            <span className="text-sm">
              {symbol ? 'Select an expiration to view volatility skew' : 'Enter a symbol to view volatility skew'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VolatilitySkew(props: VolatilitySkewProps) {
  const { symbol, selectedExpiration } = props;

  return (
    <VolatilitySkewContent
      key={`${symbol}-${selectedExpiration}`}
      {...props}
    />
  );
}
