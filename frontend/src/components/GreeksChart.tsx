import { memo } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { PortfolioGreeks } from '../types';
import HelpTooltip from './HelpTooltip';

interface GreeksChartProps {
  portfolioGreeks: PortfolioGreeks | null;
}

interface GreekInfo {
  label: string;
  description: string;
  color: string;
}

const greekInfo: Record<keyof Omit<PortfolioGreeks, 'rho'>, GreekInfo> = {
  delta: {
    label: 'Delta',
    description: 'Change in position value per $1 move in underlying',
    color: '#3b82f6', // blue
  },
  gamma: {
    label: 'Gamma',
    description: 'Rate of change of delta',
    color: '#8b5cf6', // purple
  },
  theta: {
    label: 'Theta',
    description: 'Daily time decay (P/L change per day)',
    color: '#ef4444', // red
  },
  vega: {
    label: 'Vega',
    description: 'Change in position value per 1% IV change',
    color: '#10b981', // green
  },
};

function GreeksChart({ portfolioGreeks }: GreeksChartProps) {
  if (!portfolioGreeks) {
    return null;
  }

  // Format values for display
  const formatValue = (value: number | null | undefined, greek: string): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';

    switch (greek) {
      case 'delta':
        return value.toFixed(2);
      case 'gamma':
        return value.toFixed(4);
      case 'theta':
        // Theta is monetary ($/day), show with $ prefix
        const sign = value > 0 ? '+' : value < 0 ? '-' : '';
        return `${sign}$${Math.abs(value).toFixed(2)}`;
      case 'vega':
        // Vega is monetary ($ per 1% IV), show with $ prefix
        return `$${value.toFixed(2)}`;
      default:
        return value.toFixed(3);
    }
  };

  // Get color class for value
  const getValueColorClass = (value: number, greek: string): string => {
    if (greek === 'theta') {
      // For theta, positive is good (collecting premium)
      return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    } else if (greek === 'delta') {
      // Delta can be positive or negative based on strategy
      return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    }
    return 'text-foreground';
  };

  // Get trend icon based on greek and value
  const getTrendIcon = (value: number, greek: string) => {
    const absValue = Math.abs(value);
    const size = 20;

    if (greek === 'delta') {
      if (value > 0.2) return <ArrowUpRight size={size} className="text-green-600 dark:text-green-400" />;
      if (value < -0.2) return <ArrowDownRight size={size} className="text-red-600 dark:text-red-400" />;
      return <Minus size={size} className="text-muted-foreground" />;
    } else if (greek === 'theta') {
      if (value > 0) return <TrendingUp size={size} className="text-green-600 dark:text-green-400" />;
      if (value < 0) return <TrendingDown size={size} className="text-red-600 dark:text-red-400" />;
      return <Minus size={size} className="text-muted-foreground" />;
    } else if (greek === 'gamma' || greek === 'vega') {
      if (absValue > 0.1) return <TrendingUp size={size} className="text-blue-600 dark:text-blue-400" />;
      return <Minus size={size} className="text-muted-foreground" />;
    }
    return <Minus size={size} className="text-muted-foreground" />;
  };

  // Get magnitude label
  const getMagnitudeLabel = (value: number, greek: string): string => {
    const absValue = Math.abs(value);
    if (greek === 'delta') {
      if (absValue > 0.5) return 'Strong';
      if (absValue > 0.2) return 'Moderate';
      return 'Weak';
    } else if (greek === 'gamma') {
      if (absValue > 0.05) return 'High';
      if (absValue > 0.01) return 'Moderate';
      return 'Low';
    } else if (greek === 'theta') {
      if (absValue > 10) return 'High';
      if (absValue > 3) return 'Moderate';
      return 'Low';
    } else if (greek === 'vega') {
      if (absValue > 50) return 'High';
      if (absValue > 10) return 'Moderate';
      return 'Low';
    }
    return 'Low';
  };

  return (
    <div className="w-full space-y-4">
      <h3 className="text-lg font-medium">Position Greeks</h3>

      {/* Greeks Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.entries(greekInfo) as [keyof typeof greekInfo, GreekInfo][]).map(([key, info]) => {
          const value = portfolioGreeks[key];
          const magnitude = getMagnitudeLabel(value, key);

          return (
            <div
              key={key}
              className="bg-card border rounded-lg p-4 hover:shadow-md transition-all hover:scale-[1.02] relative overflow-hidden"
            >
              {/* Accent bar at top */}
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: info.color }} />

              <div className="flex items-start justify-between mb-2">
                <div className="flex flex-col gap-1">
                  <HelpTooltip term={key}>
                    <h4 className="text-sm font-medium uppercase" style={{ color: info.color }}>
                      {info.label}
                    </h4>
                  </HelpTooltip>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-semibold inline-block w-fit">
                    {magnitude}
                  </span>
                </div>
                {getTrendIcon(value, key)}
              </div>

              <div className={`text-2xl font-bold mb-1 ${getValueColorClass(value, key)}`}>
                {formatValue(value, key)}
              </div>

              {/* Progress bar for visual magnitude */}
              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full transition-all duration-500 rounded-full"
                  style={{
                    backgroundColor: info.color,
                    width: `${Math.min(Math.abs(value) * (key === 'delta' ? 100 : key === 'gamma' ? 2000 : key === 'theta' ? 10 : 2), 100)}%`
                  }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {info.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Greeks Interpretation */}
      <div className="bg-muted/30 border rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3">Position Analysis</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="font-medium">Directional Bias:</span>
            <span className="ml-2">
              {portfolioGreeks.delta > 0.1 ? (
                <span className="text-green-600 dark:text-green-400">Bullish (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
              ) : portfolioGreeks.delta < -0.1 ? (
                <span className="text-red-600 dark:text-red-400">Bearish (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
              ) : (
                <span className="text-muted-foreground">Neutral (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
              )}
            </span>
          </div>
          <div>
            <span className="font-medium">Time Decay:</span>
            <span className="ml-2">
              {portfolioGreeks.theta > 0 ? (
                <span className="text-green-600 dark:text-green-400">
                  Benefiting (+${portfolioGreeks.theta.toFixed(2)}/day)
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">
                  Losing (${portfolioGreeks.theta.toFixed(2)}/day)
                </span>
              )}
            </span>
          </div>
          <div>
            <span className="font-medium">Volatility Exposure:</span>
            <span className="ml-2">
              {Math.abs(portfolioGreeks.vega) > 0.1 ? (
                portfolioGreeks.vega > 0 ? (
                  <span className="text-blue-600 dark:text-blue-400">Long Vega (+{portfolioGreeks.vega.toFixed(2)})</span>
                ) : (
                  <span className="text-orange-600 dark:text-orange-400">Short Vega ({portfolioGreeks.vega.toFixed(2)})</span>
                )
              ) : (
                <span className="text-muted-foreground">Vega Neutral</span>
              )}
            </span>
          </div>
          <div>
            <span className="font-medium">Gamma Exposure:</span>
            <span className="ml-2">
              {portfolioGreeks.gamma > 0 ? (
                <span className="text-green-600 dark:text-green-400">Positive (Delta increases with price)</span>
              ) : portfolioGreeks.gamma < 0 ? (
                <span className="text-red-600 dark:text-red-400">Negative (Delta decreases with price)</span>
              ) : (
                <span className="text-muted-foreground">Neutral</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Greeks Explanation Guide */}
      <details className="bg-card border rounded-lg p-4">
        <summary className="cursor-pointer text-sm font-medium hover:text-primary">
          Understanding Greeks (Click to expand)
        </summary>
        <div className="mt-4 space-y-3 text-sm text-left">
          <div className="flex">
            <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-16">Delta:</span>
            <div className="text-muted-foreground leading-relaxed">
              If delta is +50, a $1 increase in stock price increases your position value by $50.<br />
              Positive = bullish, Negative = bearish, Zero = neutral.
            </div>
          </div>
          <div className="flex">
            <span className="font-semibold text-purple-600 dark:text-purple-400 shrink-0 w-16">Gamma:</span>
            <div className="text-muted-foreground leading-relaxed">
              How much delta changes when stock moves $1.<br />
              High gamma means delta changes rapidly.<br />
              Long options = positive gamma, Short options = negative gamma.
            </div>
          </div>
          <div className="flex">
            <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 w-16">Theta:</span>
            <div className="text-muted-foreground leading-relaxed">
              Daily profit/loss from time decay.<br />
              Positive theta = you earn money each day (seller).<br />
              Negative theta = you lose money each day (buyer).
            </div>
          </div>
          <div className="flex">
            <span className="font-semibold text-green-600 dark:text-green-400 shrink-0 w-16">Vega:</span>
            <div className="text-muted-foreground leading-relaxed">
              Change in position value for 1% IV change.<br />
              Positive vega = benefit from IV increase.<br />
              Negative vega = benefit from IV decrease.
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes but Greeks haven't
export default memo(GreeksChart, (prevProps, nextProps) => {
  if (!prevProps.portfolioGreeks && !nextProps.portfolioGreeks) return true;
  if (!prevProps.portfolioGreeks || !nextProps.portfolioGreeks) return false;

  return (
    prevProps.portfolioGreeks.delta === nextProps.portfolioGreeks.delta &&
    prevProps.portfolioGreeks.gamma === nextProps.portfolioGreeks.gamma &&
    prevProps.portfolioGreeks.theta === nextProps.portfolioGreeks.theta &&
    prevProps.portfolioGreeks.vega === nextProps.portfolioGreeks.vega
  );
});
