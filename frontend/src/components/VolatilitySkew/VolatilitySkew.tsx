import { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import SkewChart from './SkewChart';
import ExpirationDropdown from '../ExpirationDropdown';
import { useVolatilitySkew } from '../../hooks/useVolatilitySkew';
import type { MarketData } from '../../types';

interface VolatilitySkewProps {
  symbol: string;
  marketData: MarketData | null;
  selectedExpiration: string;
  isDark: boolean;
  onExpirationChange?: (expiration: string) => void;
}

export default function VolatilitySkew({
  symbol,
  marketData,
  selectedExpiration: propExpiration,
  isDark,
  onExpirationChange,
}: VolatilitySkewProps) {
  // Local state for expiration
  const [localExpiration, setLocalExpiration] = useState(propExpiration);

  // Update local when prop changes
  useEffect(() => {
    setLocalExpiration(propExpiration);
  }, [propExpiration]);

  const { skewData, loading, error, fetchSkewData, clearSkewData } = useVolatilitySkew();

  // Fetch skew data when symbol or expiration changes
  useEffect(() => {
    if (symbol && localExpiration && marketData?.current_price) {
      fetchSkewData(symbol, localExpiration);
    } else {
      clearSkewData();
    }
  }, [symbol, localExpiration, marketData?.current_price, fetchSkewData, clearSkewData]);

  const handleExpirationChange = (expiration: string) => {
    setLocalExpiration(expiration);
    if (onExpirationChange) {
      onExpirationChange(expiration);
    }
  };

  // Format IV as percentage
  const formatIV = (iv: number) => {
    return (iv * 100).toFixed(1) + '%';
  };

  // Format skew metric
  const formatSkew = (skew: number | null) => {
    if (skew === null) return 'N/A';
    const sign = skew >= 0 ? '+' : '';
    return sign + (skew * 100).toFixed(1) + '%';
  };

  // Calculate skew metric from data points if not provided by API
  const calculatedSkewMetric = (() => {
    if (skewData?.skew_metric !== null && skewData?.skew_metric !== undefined) {
      return skewData.skew_metric;
    }
    // Fallback: find points near 25 delta and calculate skew
    if (skewData?.points && skewData.points.length > 0) {
      // Find call near 25 delta (0.25) and put near -25 delta (-0.25)
      let call25 = skewData.points.find(p => p.call_delta && p.call_delta >= 0.20 && p.call_delta <= 0.30);
      let put25 = skewData.points.find(p => p.put_delta && p.put_delta >= -0.30 && p.put_delta <= -0.20);

      if (call25?.call_iv && put25?.put_iv) {
        return put25.put_iv - call25.call_iv;
      }

      // Wider fallback: use ATM skew (compare call/put IV near current price)
      const atmPoint = skewData.points.find(p =>
        p.strike && skewData.current_price &&
        Math.abs(p.strike - skewData.current_price) / skewData.current_price < 0.02
      );
      if (atmPoint?.call_iv && atmPoint?.put_iv) {
        return atmPoint.put_iv - atmPoint.call_iv;
      }
    }
    return null;
  })();

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Volatility Skew
        </h2>

        {/* Expiration Selector */}
        {symbol && (
          <ExpirationDropdown
            symbol={symbol}
            value={localExpiration}
            onChange={handleExpirationChange}
            isDark={isDark}
          />
        )}
      </div>

      {/* Skew Metric Badge and Gauge */}
      {calculatedSkewMetric !== null && (
        <div className="mb-4 flex flex-col items-center gap-3">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-muted/80 px-4 py-2 rounded-full text-sm">
            <span className="text-muted-foreground">Skew Metric (25Δ):</span>
            <span className={`font-semibold ${calculatedSkewMetric > 0 ? 'text-red-500' : calculatedSkewMetric < 0 ? 'text-green-500' : 'text-foreground'}`}>
              {formatSkew(calculatedSkewMetric)}
            </span>
          </div>

          {/* Skew Gauge */}
          <div className="w-full max-w-md">
            {/* Labels */}
            <div className="flex justify-between text-xs mb-1">
              <span className={`font-medium ${calculatedSkewMetric < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                ← Calls Richer
              </span>
              <span className="text-muted-foreground">Balanced</span>
              <span className={`font-medium ${calculatedSkewMetric > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                Puts Richer →
              </span>
            </div>

            {/* Gauge Bar */}
            <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-green-500/30 via-gray-500/20 to-red-500/30">
              {/* Center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/50" />

              {/* Skew indicator - position based on skew_metric, clamped to -0.1 to +0.1 range */}
              <div
                className="absolute top-0 bottom-0 w-1 rounded-full shadow-lg transition-all duration-300"
                style={{
                  left: `${50 + Math.max(-50, Math.min(50, calculatedSkewMetric * 500))}%`,
                  transform: 'translateX(-50%)',
                  backgroundColor: calculatedSkewMetric > 0
                    ? (isDark ? '#ef4444' : '#dc2626')
                    : calculatedSkewMetric < 0
                      ? (isDark ? '#10b981' : '#059669')
                      : (isDark ? '#9ca3af' : '#6b7280'),
                  boxShadow: `0 0 8px ${calculatedSkewMetric > 0 ? 'rgba(239, 68, 68, 0.5)' : calculatedSkewMetric < 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(156, 163, 175, 0.5)'}`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="h-[350px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Fetching volatility skew data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="h-[350px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-md text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {!loading && !error && skewData && (
        <>
          <SkewChart data={skewData} isDark={isDark} />

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 rounded"
                style={{ backgroundColor: isDark ? '#10b981' : '#059669' }}
              />
              <span className="text-muted-foreground">Calls</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 rounded"
                style={{ backgroundColor: isDark ? '#ef4444' : '#dc2626' }}
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
                  backgroundColor: isDark ? '#6366f1' : '#4f46e5',
                  borderStyle: 'dashed',
                  backgroundImage: `linear-gradient(to right, ${isDark ? '#6366f1' : '#4f46e5'} 50%, transparent 50%)`,
                  backgroundSize: '8px 100%',
                }}
              />
              <span className="text-muted-foreground">
                Current Price (${marketData?.current_price?.toFixed(2)})
              </span>
            </div>
          </div>
        </>
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
