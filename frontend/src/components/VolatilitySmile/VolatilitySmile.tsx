import { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import SmileChart from './SmileChart';
import ExpirationDropdown from '../ExpirationDropdown';
import { useVolatilitySmile } from '../../hooks/useVolatilitySmile';
import type { MarketData } from '../../types';

interface VolatilitySmileProps {
  symbol: string;
  marketData: MarketData | null;
  selectedExpiration: string;
  isDark: boolean;
  onExpirationChange?: (expiration: string) => void;
}

export default function VolatilitySmile({
  symbol,
  marketData,
  selectedExpiration: propExpiration,
  isDark,
  onExpirationChange,
}: VolatilitySmileProps) {
  // Local state for expiration
  const [localExpiration, setLocalExpiration] = useState(propExpiration);

  // Update local when prop changes
  useEffect(() => {
    setLocalExpiration(propExpiration);
  }, [propExpiration]);

  const { smileData, loading, error, fetchSmileData, clearSmileData } = useVolatilitySmile();

  // Fetch smile data when symbol or expiration changes
  useEffect(() => {
    if (symbol && localExpiration && marketData?.current_price) {
      fetchSmileData(symbol, localExpiration);
    } else {
      clearSmileData();
    }
  }, [symbol, localExpiration, marketData?.current_price, fetchSmileData, clearSmileData]);

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

      {/* Skew Metric Badge */}
      {smileData?.skew_metric !== null && smileData?.skew_metric !== undefined && (
        <div className="mb-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 bg-muted/80 px-4 py-2 rounded-full text-sm">
            <span className="text-muted-foreground">Skew Metric (25Δ):</span>
            <span className={`font-semibold ${smileData.skew_metric > 0 ? 'text-red-500' : smileData.skew_metric < 0 ? 'text-green-500' : 'text-foreground'}`}>
              {formatSkew(smileData.skew_metric)}
            </span>
            <span className="text-muted-foreground text-xs">
              ({smileData.skew_metric > 0 ? 'Puts richer' : smileData.skew_metric < 0 ? 'Calls richer' : 'Balanced'})
            </span>
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
      {!loading && !error && smileData && (
        <>
          <SmileChart data={smileData} isDark={isDark} />

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
                ATM ({formatIV(smileData.atm_iv)})
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
      {!loading && !error && !smileData && (
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
