import { useMemo, useState, type RefObject } from 'react';
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
  ReferenceDot,
  ReferenceArea,
} from 'recharts';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import type { ChartDataPoint, Position, MarketData, ZoomRange, BreakevenPoint } from '../types';

interface PLChartProps {
  chartData: ChartDataPoint[];
  positions: Position[];
  marketData: MarketData | null;
  zoomRange: ZoomRange;
  xAxisTicks: number[];
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
}

export default function PLChart({
  chartData,
  positions,
  marketData,
  zoomRange,
  xAxisTicks,
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
}: PLChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number } | null>(null);

  // Calculate breakeven points
  const breakevenPoints = useMemo((): BreakevenPoint[] => {
    if (!chartData.length) return [];
    const points: BreakevenPoint[] = [];
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

    return chartData.slice(start, end + 1).map((d, idx) => {
      // Use interpolated P/L if available, otherwise use API-provided pl_at_date
      // But only when NOT in expiration mode
      const globalIdx = start + idx;
      const plAtDate = isExpirationMode
        ? undefined
        : (interpolatedPLAtDate
            ? interpolatedPLAtDate[globalIdx]
            : d.pl_at_date);

      return {
        ...d,
        profit: d.pl > 0 ? d.pl : 0,
        loss: d.pl < 0 ? d.pl : 0,
        // For the date line, use interpolated or API-provided pl_at_date
        pl_at_date: plAtDate,
        pl_at_date_profit: plAtDate !== undefined && plAtDate > 0 ? plAtDate : undefined,
        pl_at_date_loss: plAtDate !== undefined && plAtDate < 0 ? plAtDate : undefined,
      };
    });
  }, [chartData, zoomRange, interpolatedPLAtDate, evalDaysFromNow]);

  // Calculate profit and loss zones for visual overlays
  const profitLossZones = useMemo(() => {
    if (!visibleChartData.length || breakevenPoints.length === 0) return { profitZones: [], lossZones: [] };

    const zones: { profitZones: Array<{ x1: number; x2: number }>; lossZones: Array<{ x1: number; x2: number }> } = {
      profitZones: [],
      lossZones: []
    };

    const minPrice = visibleChartData[0].price;
    const maxPrice = visibleChartData[visibleChartData.length - 1].price;
    const sortedBreakevens = [...breakevenPoints].sort((a, b) => a.x - b.x);

    // Check first zone (before first breakeven)
    if (sortedBreakevens.length > 0) {
      const firstData = visibleChartData[0];
      if (firstData.pl > 0) {
        zones.profitZones.push({ x1: minPrice, x2: sortedBreakevens[0].x });
      } else if (firstData.pl < 0) {
        zones.lossZones.push({ x1: minPrice, x2: sortedBreakevens[0].x });
      }
    }

    // Check zones between breakevens
    for (let i = 0; i < sortedBreakevens.length - 1; i++) {
      const midPrice = (sortedBreakevens[i].x + sortedBreakevens[i + 1].x) / 2;
      const midPoint = visibleChartData.find(d => Math.abs(d.price - midPrice) < 0.5);
      if (midPoint) {
        if (midPoint.pl > 0) {
          zones.profitZones.push({ x1: sortedBreakevens[i].x, x2: sortedBreakevens[i + 1].x });
        } else if (midPoint.pl < 0) {
          zones.lossZones.push({ x1: sortedBreakevens[i].x, x2: sortedBreakevens[i + 1].x });
        }
      }
    }

    // Check last zone (after last breakeven)
    if (sortedBreakevens.length > 0) {
      const lastData = visibleChartData[visibleChartData.length - 1];
      if (lastData.pl > 0) {
        zones.profitZones.push({ x1: sortedBreakevens[sortedBreakevens.length - 1].x, x2: maxPrice });
      } else if (lastData.pl < 0) {
        zones.lossZones.push({ x1: sortedBreakevens[sortedBreakevens.length - 1].x, x2: maxPrice });
      }
    }

    return zones;
  }, [visibleChartData, breakevenPoints]);

  // Memoize YAxis domain calculation for better performance
  const yAxisDomain = useMemo((): [number, number] => {
    if (!visibleChartData.length) return [-100, 100];

    // Include both pl and pl_at_date in domain calculation
    const allValues: number[] = [];
    visibleChartData.forEach(d => {
      allValues.push(d.pl);
      if (d.pl_at_date !== undefined) {
        allValues.push(d.pl_at_date);
      }
    });

    const maxPL = Math.max(...allValues);
    const minPL = Math.min(...allValues);

    // Ensure we don't have a 0 range
    if (maxPL === minPL) return [minPL - 100, maxPL + 100];

    // Use symmetric scaling around zero for better visualization
    const absMax = Math.max(Math.abs(maxPL), Math.abs(minPL));
    const padding = absMax * 0.15;

    return [-(absMax + padding), absMax + padding];
  }, [visibleChartData]);

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

  return (
    <>
      <div
        ref={chartContainerRef}
        className="h-[420px] w-full select-none"
        style={{ cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart
            data={visibleChartData}
            margin={{ top: 20, right: 0, left: 0, bottom: 10 }}
            onMouseMove={(e) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                const data = e.activePayload[0].payload;
                setHoveredPoint({ x: data.price, y: data.pl });
              }
            }}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <CartesianGrid stroke="#525252" vertical={false} />

            {/* Profit/Loss Zone Overlays */}
            {profitLossZones.profitZones.map((zone, idx) => (
              <ReferenceArea
                key={`profit-zone-${idx}`}
                x1={zone.x1}
                x2={zone.x2}
                y1={yAxisDomain[0]}
                y2={yAxisDomain[1]}
                fill="#10b981"
                fillOpacity={0.05}
                strokeOpacity={0}
              />
            ))}
            {profitLossZones.lossZones.map((zone, idx) => (
              <ReferenceArea
                key={`loss-zone-${idx}`}
                x1={zone.x1}
                x2={zone.x2}
                y1={yAxisDomain[0]}
                y2={yAxisDomain[1]}
                fill="#ef4444"
                fillOpacity={0.05}
                strokeOpacity={0}
              />
            ))}

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
                    <div className="bg-[#262626] border border-[#404040] text-[#e5e5e5] rounded-lg p-3 shadow-lg">
                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <span className="text-gray-400">Price:</span>
                        <span className="text-right font-medium">
                          ${Number.isInteger(label) ? label : (label as number).toFixed(2)}
                        </span>

                        {/* Show P/L at selected date if available */}
                        {plAtDateValue !== undefined && dateLabel && (
                          <>
                            <span className="text-blue-400">P/L ({dateLabel}):</span>
                            <span className={`text-right font-medium ${plAtDateValue >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                              ${Math.round(plAtDateValue)}
                            </span>
                          </>
                        )}

                        {/* Always show P/L at expiration */}
                        <span className="text-gray-400">{plAtDateValue !== undefined ? 'P/L (Exp):' : 'P/L:'}</span>
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
                    const { x, y } = viewBox as { x: number; y: number };
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
                      const { x, y } = viewBox as { x: number; y: number };
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
            {/* Breakeven points with labels */}
            {breakevenPoints.map((point, index) => (
              <ReferenceDot
                key={`breakeven-${index}`}
                x={point.x}
                y={point.y}
                r={5}
                fill="#f59e0b"
                stroke="#fff"
                strokeWidth={2}
                label={{
                  content: ({ viewBox }) => {
                    const { x, y } = viewBox as { x: number; y: number };
                    return (
                      <g>
                        {/* Breakeven label background */}
                        <rect
                          x={x - 35}
                          y={y - 28}
                          width={70}
                          height={18}
                          fill={isDark ? '#78350f' : '#fef3c7'}
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          rx={4}
                          ry={4}
                        />
                        {/* Breakeven label text */}
                        <text
                          x={x}
                          y={y - 16}
                          textAnchor="middle"
                          fill={isDark ? '#fbbf24' : '#b45309'}
                          fontSize={10}
                          fontWeight={600}
                        >
                          BE: ${point.x.toFixed(2)}
                        </text>
                      </g>
                    );
                  }
                }}
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
                      const { x, y } = viewBox as { x: number; y: number };
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
            {/* P/L at selected date line (dashed blue line) */}
            {hasPLAtDate && (
              <Line
                type="monotone"
                dataKey="pl_at_date"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-2 -mt-8 relative z-10">
        <button
          onClick={onZoomIn}
          className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
          title="Zoom In"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={onResetZoom}
          className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
          title="Reset Zoom"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </>
  );
}
