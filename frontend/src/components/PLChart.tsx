import { useMemo, type RefObject } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Plus, Minus, RotateCcw, TrendingUp, TrendingDown, Circle, Target } from 'lucide-react';
import type {
  ChartDataPoint,
  Position,
  MarketData,
  ProbabilityMetrics,
  SellerMetrics,
  ManagementSettings,
  IvScenarioBase,
} from '../types';
import { ivScenarioAdjustment } from '../utils/ivScenario';
import { createStore, useStore, type Store } from '../utils/store';
import { withProfitLossSegments, priceRangesAtOrAbove, priceAxisTicks, findBreakevenPrices, plYDomain } from './plChartData';
import PLChartMarkers, { type PLChartColors } from './PLChartMarkers';
import { formatDollars } from '../utils/format';
import { useZoomRange, type ZoomStore } from '../hooks/useChartZoom';

interface PLChartProps {
  chartData: ChartDataPoint[];
  positions: Position[];
  marketData: MarketData | null;
  zoomStore: ZoomStore;
  isDark: boolean;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  evalDaysFromNow?: number | null;
  precomputedDates?: Record<number, number[]> | null;
  probabilityMetrics?: ProbabilityMetrics | null;
  sellerMetrics?: SellerMetrics | null;
  management?: ManagementSettings;
  /** Net credit in dollars (negative for a debit) */
  netCredit?: number;
  /** Live IV slider value (percent) to preview against the priced curves */
  ivPreviewStore?: Store<number>;
  ivScenarioBase?: IvScenarioBase | null;
}

const NO_IV_PREVIEW = createStore(0);

export default function PLChart({
  chartData,
  positions,
  marketData,
  zoomStore,
  isDark,
  chartContainerRef,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  evalDaysFromNow,
  precomputedDates,
  probabilityMetrics = null,
  sellerMetrics = null,
  management,
  netCredit = 0,
  ivPreviewStore = NO_IV_PREVIEW,
  ivScenarioBase = null,
}: PLChartProps) {
  const zoomRange = useZoomRange(zoomStore);
  const ivPreviewPct = useStore(ivPreviewStore);

  // Theme-aware chart palette aligned with the neutral design tokens
  // (SVG attributes can't resolve CSS vars, so hex values are used here)
  const chartColors = useMemo((): PLChartColors & { axis: string } => ({
    grid: isDark ? '#3a3a3a' : '#e4e4e4',
    gridDashed: isDark ? '#525252' : '#a3a3a3',
    axis: isDark ? '#3a3a3a' : '#d4d4d4',
    zero: isDark ? '#e5e5e5' : '#171717',
    label: isDark ? '#a3a3a3' : '#737373',
    positive: isDark ? '#34d399' : '#059669',
    negative: isDark ? '#f87171' : '#dc2626',
    accent: isDark ? '#60a5fa' : '#3b82f6',
  }), [isDark]);

  const breakevenPrices = useMemo(() => findBreakevenPrices(chartData), [chartData]);

  // Client-side interpolation: get P/L values for the selected date from precomputed data
  // Returns null when evalDaysFromNow is null (Expiration mode) - we don't show the date line at expiration
  const interpolatedPLAtDate = useMemo(() => {
    // When evalDaysFromNow is null, we're at expiration - don't show the date line
    // (the solid line already shows P/L at expiration)
    if (evalDaysFromNow === null || evalDaysFromNow === undefined) {
      return null;
    }

    if (!precomputedDates || Object.keys(precomputedDates).length === 0) {
      return null;
    }

    const days = Object.keys(precomputedDates).map(Number).sort((a, b) => a - b);

    // Find the two closest precomputed dates for interpolation
    let lowerDay = days[0];
    let upperDay = days[days.length - 1];

    for (let i = 0; i < days.length; i++) {
      if (days[i] <= evalDaysFromNow) lowerDay = days[i];
      if (days[i] >= evalDaysFromNow) {
        upperDay = days[i];
        break;
      }
    }

    // If exact match, return directly
    if (lowerDay === evalDaysFromNow && precomputedDates[lowerDay]) {
      return precomputedDates[lowerDay];
    }

    // If at boundaries, use nearest
    if (evalDaysFromNow <= lowerDay) return precomputedDates[lowerDay];
    if (evalDaysFromNow >= upperDay) return precomputedDates[upperDay];

    // Linear interpolation between two precomputed dates
    const lowerPL = precomputedDates[lowerDay];
    const upperPL = precomputedDates[upperDay];

    if (!lowerPL || !upperPL || lowerPL.length !== upperPL.length) {
      return precomputedDates[lowerDay] || precomputedDates[upperDay];
    }

    const ratio = (evalDaysFromNow - lowerDay) / (upperDay - lowerDay);
    return lowerPL.map((pl, i) => pl + (upperPL[i] - pl) * ratio);
  }, [evalDaysFromNow, precomputedDates]);

  // Date curve shifted to the live IV slider value until the server reprices it
  const datePL = useMemo(() => {
    if (evalDaysFromNow === null || evalDaysFromNow === undefined) return null;
    const base = interpolatedPLAtDate
      ?? (chartData.length && chartData.every(d => d.pl_at_date !== undefined) ? chartData.map(d => d.pl_at_date!) : null);
    if (!base || !ivScenarioBase || ivPreviewPct === ivScenarioBase.ivShiftPct) return base;
    const adjustment = ivScenarioAdjustment(
      chartData.map(d => d.price),
      ivScenarioBase.positions,
      ivScenarioBase.legs,
      evalDaysFromNow,
      ivScenarioBase.riskFreeRate,
      ivScenarioBase.ivShiftPct / 100,
      ivPreviewPct / 100,
    );
    return base.map((pl, i) => pl + adjustment[i]);
  }, [evalDaysFromNow, interpolatedPLAtDate, chartData, ivScenarioBase, ivPreviewPct]);

  // Check if we should show the pl_at_date line
  // Only show when evalDaysFromNow is set (not null/expiration) and we have data
  const hasPLAtDate = useMemo(() => {
    // Don't show the date line when evalDaysFromNow is null (Expiration mode)
    if (evalDaysFromNow === null || evalDaysFromNow === undefined) {
      return false;
    }
    return interpolatedPLAtDate !== null || chartData.some(d => d.pl_at_date !== undefined);
  }, [chartData, interpolatedPLAtDate, evalDaysFromNow]);

  // Compute visible chart data based on zoom range with profit/loss split
  const visibleChartData = useMemo(() => {
    if (!chartData.length) return [];
    const start = zoomRange.startIndex;
    const end = zoomRange.endIndex || chartData.length - 1;

    // Don't include pl_at_date when in expiration mode
    const isExpirationMode = evalDaysFromNow === null || evalDaysFromNow === undefined;

    const points = chartData.slice(start, end + 1).map((d, idx) => {
      // Use interpolated P/L if available, otherwise use API-provided pl_at_date
      // But only when NOT in expiration mode
      const globalIdx = start + idx;
      const plAtDate = isExpirationMode
        ? undefined
        : (datePL ? datePL[globalIdx] : d.pl_at_date);

      return {
        ...d,
        // For the date line, use interpolated or API-provided pl_at_date
        pl_at_date: plAtDate,
      };
    });

    return withProfitLossSegments(points);
  }, [chartData, zoomRange, datePL, evalDaysFromNow]);

  const xAxisTicks = useMemo(() => {
    if (!chartData.length) return [];
    const end = zoomRange.endIndex || chartData.length - 1;
    return priceAxisTicks(chartData[zoomRange.startIndex]?.price ?? NaN, chartData[end]?.price ?? NaN);
  }, [chartData, zoomRange]);

  // Management levels only apply to credit trades with a bounded max profit
  const metricsMaxProfit = probabilityMetrics ? probabilityMetrics.max_profit : undefined;
  const profitTargetPL = useMemo(() => {
    if (!management || netCredit <= 0 || metricsMaxProfit === null || metricsMaxProfit === undefined || metricsMaxProfit <= 0) {
      return null;
    }
    return metricsMaxProfit * management.profitTargetPct / 100;
  }, [management, netCredit, metricsMaxProfit]);

  const stopLossPL = management && netCredit > 0 ? -management.stopMultiple * netCredit : null;
  const expectedMove = sellerMetrics?.expected_move ?? null;

  // Price ranges where the selected date's curve is at or above the profit target
  const targetZones = useMemo(() => {
    if (profitTargetPL === null || !chartData.length) return null;
    const isExpirationMode = evalDaysFromNow === null || evalDaysFromNow === undefined;
    const curve = chartData.map((d, i) => ({
      price: d.price,
      value: isExpirationMode
        ? d.pl
        : (datePL ? datePL[i] : d.pl_at_date ?? d.theoretical_pl ?? d.pl),
    }));
    return priceRangesAtOrAbove(curve, profitTargetPL);
  }, [profitTargetPL, chartData, evalDaysFromNow, datePL]);

  // Fit the visible curves; the stop line is hidden when it falls outside rather
  // than stretching the axis and flattening the profit zone
  const yAxisDomain = useMemo((): [number, number] => {
    const values: number[] = [];
    visibleChartData.forEach(d => {
      values.push(d.pl);
      if (d.pl_at_date !== undefined) values.push(d.pl_at_date);
    });
    if (profitTargetPL !== null) values.push(profitTargetPL);
    return plYDomain(values);
  }, [visibleChartData, profitTargetPL]);

  // Create a strike price map for O(1) tooltip lookups
  const strikePositionMap = useMemo(() => {
    const map = new Map<number, Position[]>();
    positions.forEach(pos => {
      const key = pos.strike;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(pos);
    });
    return map;
  }, [positions]);

  // Max profit/loss: exact (with unlimited detection) from the backend, else the plotted range
  const { maxProfit, maxLoss } = useMemo((): { maxProfit: number | null; maxLoss: number | null } => {
    if (probabilityMetrics) {
      return { maxProfit: probabilityMetrics.max_profit, maxLoss: probabilityMetrics.max_loss };
    }
    if (!chartData.length) return { maxProfit: 0, maxLoss: 0 };
    const profits = chartData.map(d => d.pl);
    return {
      maxProfit: Math.max(...profits),
      maxLoss: Math.min(...profits),
    };
  }, [chartData, probabilityMetrics]);

  const dateCurveLabel = evalDaysFromNow === null || evalDaysFromNow === undefined
    ? 'at expiration'
    : evalDaysFromNow === 0
      ? 'today'
      : `in ${evalDaysFromNow} days`;

  return (
    <>
      {/* Chart Summary - Responsive layout */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        {/* Max Profit/Loss */}
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-1.5 md:gap-2">
            <TrendingUp className="w-4 h-4 text-positive" aria-hidden="true" />
            <span className="text-xs md:text-sm text-muted-foreground">Max Profit:</span>
            <span className={`text-sm md:text-base font-semibold tabular-nums ${maxProfit === null || maxProfit > 0 ? 'text-positive' : 'text-muted-foreground'}`}>
              {formatDollars(maxProfit)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <TrendingDown className="w-4 h-4 text-negative" aria-hidden="true" />
            <span className="text-xs md:text-sm text-muted-foreground">Max Loss:</span>
            <span className={`text-sm md:text-base font-semibold tabular-nums ${maxLoss === null || maxLoss < 0 ? 'text-negative' : 'text-muted-foreground'}`}>
              {formatDollars(maxLoss)}
            </span>
          </div>
        </div>

        {/* Legend - Hidden on mobile, shown on md+ */}
        <div className="hidden md:flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-positive rounded" />
            <span className="text-muted-foreground">Profit Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-negative rounded" />
            <span className="text-muted-foreground">Loss Zone</span>
          </div>
          {hasPLAtDate && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-primary rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor, currentColor 3px, transparent 3px, transparent 6px)' }} />
              <span className="text-muted-foreground">P/L Today</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Circle className="w-3 h-3 fill-amber-500 text-amber-500" aria-hidden="true" />
            <span className="text-muted-foreground">Breakeven</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-primary border-2 border-card" />
            <span className="text-muted-foreground">Current Price</span>
          </div>
          {expectedMove && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm bg-primary/15 border border-primary/30" />
              <span className="text-muted-foreground">Expected Move</span>
            </div>
          )}
        </div>
      </div>

      {profitTargetPL !== null && management && targetZones && (
        <div className="flex items-center gap-2 mb-3 text-xs md:text-sm text-muted-foreground" data-testid="target-zone">
          <Target className="w-4 h-4 text-positive shrink-0" aria-hidden="true" />
          {targetZones.length > 0 ? (
            <span>
              {management.profitTargetPct}% target ({formatDollars(profitTargetPL)}) is reached {dateCurveLabel} with the stock between{' '}
              <span className="font-medium text-foreground tabular-nums">
                {targetZones.map(z => `$${z.low.toFixed(2)}–$${z.high.toFixed(2)}`).join(' or ')}
              </span>
            </span>
          ) : (
            <span>
              {management.profitTargetPct}% target ({formatDollars(profitTargetPL)}) is not reached {dateCurveLabel} at any price. Move the date slider later.
            </span>
          )}
        </div>
      )}

      {/* Compact legend for mobile */}
      <div className="flex md:hidden flex-wrap items-center justify-center gap-3 mb-3 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-positive rounded" />
          <span className="text-muted-foreground">Profit</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-negative rounded" />
          <span className="text-muted-foreground">Loss</span>
        </div>
        <div className="flex items-center gap-1">
          <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500" aria-hidden="true" />
          <span className="text-muted-foreground">BE</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="text-muted-foreground">Current</span>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="h-[300px] md:h-[420px] w-full select-none touch-pan-y data-dragging:[&_.recharts-wrapper]:pointer-events-none"
        style={{ cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleChartData}
            margin={{ top: 20, right: 0, left: 0, bottom: 10 }}
          >
            <CartesianGrid stroke={chartColors.grid} vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={xAxisTicks}
              allowDecimals={false}
              stroke={chartColors.gridDashed}
              tick={false}
              axisLine={{ stroke: chartColors.axis }}
              tickLine={{ stroke: chartColors.axis }}
            />
            <YAxis
              stroke={chartColors.gridDashed}
              tick={false}
              width={0}
              domain={yAxisDomain}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const plValue = payload[0].payload.pl;
                  const plAtDateValue = payload[0].payload.pl_at_date;
                  const isBreakeven = plValue === 0;
                  const matchingPositions: Position[] = [];
                  for (const [strike, posList] of strikePositionMap.entries()) {
                    if (Math.abs(strike - (label as number)) < 0.5) {
                      matchingPositions.push(...posList);
                    }
                  }

                  // Format the date label
                  const getDateLabel = () => {
                    if (evalDaysFromNow === null || evalDaysFromNow === undefined) return null;
                    if (evalDaysFromNow === 0) return 'Today';
                    if (evalDaysFromNow === 1) return '1 day';
                    return `${evalDaysFromNow} days`;
                  };
                  const dateLabel = getDateLabel();

                  return (
                    <div className="bg-popover border border-border text-popover-foreground rounded-lg p-3 shadow-lg">
                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Price:</span>
                        <span className="text-right font-medium">
                          ${Number.isInteger(label) ? label : (label as number).toFixed(2)}
                        </span>

                        {/* Show P/L at selected date if available */}
                        {plAtDateValue !== undefined && dateLabel && (
                          <>
                            <span className="text-primary">P/L ({dateLabel}):</span>
                            <span className={`text-right font-medium tabular-nums ${plAtDateValue >= 0 ? 'text-primary' : 'text-negative'}`}>
                              ${Math.round(plAtDateValue)}
                            </span>
                          </>
                        )}

                        {/* Always show P/L at expiration */}
                        <span className="text-muted-foreground">{plAtDateValue !== undefined ? 'P/L (Exp):' : 'P/L:'}</span>
                        <span className={`text-right font-medium tabular-nums ${plValue >= 0 ? 'text-positive' : 'text-negative'}`}>
                          ${plValue}
                        </span>

                        {isBreakeven && (
                          <span className="col-span-2 text-center text-amber-600 dark:text-amber-400 font-semibold mt-1 pt-1 border-t border-border">
                            Breakeven
                          </span>
                        )}
                        {matchingPositions.length > 0 && (
                          <div className="col-span-2 mt-1 pt-1 border-t border-border">
                            {matchingPositions.map((pos, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-3 mt-1">
                                <span className={`font-semibold ${pos.qty > 0 ? 'text-positive' : 'text-negative'}`}>
                                  {pos.qty > 0 ? '+' : ''}{pos.qty} {pos.type === 'C' ? 'Call' : 'Put'}
                                </span>
                                <span className="text-muted-foreground text-xs">
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
            {expectedMove && (
              <ReferenceArea
                x1={expectedMove.lower}
                x2={expectedMove.upper}
                fill={chartColors.accent}
                fillOpacity={0.07}
                stroke={chartColors.accent}
                strokeOpacity={0.25}
                strokeDasharray="2 4"
                ifOverflow="hidden"
                label={{
                  value: `1σ move ±$${expectedMove.amount.toFixed(2)}`,
                  position: 'insideTop',
                  fill: chartColors.accent,
                  fontSize: 10,
                }}
              />
            )}
            {profitTargetPL !== null && management && (
              <ReferenceLine
                y={profitTargetPL}
                stroke={chartColors.positive}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `${management.profitTargetPct}% target ${formatDollars(profitTargetPL)}`,
                  position: 'insideBottomLeft',
                  fill: chartColors.positive,
                  fontSize: 10,
                }}
              />
            )}
            {stopLossPL !== null && management && (
              <ReferenceLine
                y={stopLossPL}
                stroke={chartColors.negative}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                ifOverflow="hidden"
                label={{
                  value: `Stop ${management.stopMultiple}× credit ${formatDollars(stopLossPL)}`,
                  position: 'insideBottomLeft',
                  fill: chartColors.negative,
                  fontSize: 10,
                }}
              />
            )}
            <ReferenceLine y={0} stroke={chartColors.zero} strokeWidth={1} />
            <PLChartMarkers
              ticks={xAxisTicks}
              positions={positions}
              breakevens={breakevenPrices}
              currentPrice={marketData?.current_price ?? null}
              colors={chartColors}
              isDark={isDark}
            />
            <Area
              type="linear"
              dataKey="profit"
              stroke={chartColors.positive}
              fill={chartColors.positive}
              fillOpacity={0.15}
              strokeWidth={2}
              baseValue={0}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="loss"
              stroke={chartColors.negative}
              fill={chartColors.negative}
              fillOpacity={0.15}
              strokeWidth={2}
              baseValue={0}
              isAnimationActive={false}
            />
            {/* P/L at selected date line (dashed blue line) */}
            {hasPLAtDate && (
              <Line
                type="monotone"
                dataKey="pl_at_date"
                stroke={chartColors.accent}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Zoom controls - Touch-friendly on mobile */}
      <div className="flex justify-center gap-2 mt-2 md:-mt-8 relative z-10">
        <button
          onClick={onZoomIn}
          className="p-2.5 md:p-2 bg-muted hover:bg-muted/80 active:bg-muted/70 rounded-lg md:rounded-md transition-colors text-muted-foreground touch-manipulation"
          title="Zoom In"
          aria-label="Zoom in on chart"
        >
          <Plus size={20} className="md:w-[18px] md:h-[18px]" aria-hidden="true" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2.5 md:p-2 bg-muted hover:bg-muted/80 active:bg-muted/70 rounded-lg md:rounded-md transition-colors text-muted-foreground touch-manipulation"
          title="Zoom Out"
          aria-label="Zoom out of chart"
        >
          <Minus size={20} className="md:w-[18px] md:h-[18px]" aria-hidden="true" />
        </button>
        <button
          onClick={onResetZoom}
          className="p-2.5 md:p-2 bg-muted hover:bg-muted/80 active:bg-muted/70 rounded-lg md:rounded-md transition-colors text-muted-foreground touch-manipulation"
          title="Reset Zoom"
          aria-label="Reset chart zoom"
        >
          <RotateCcw size={20} className="md:w-[18px] md:h-[18px]" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
