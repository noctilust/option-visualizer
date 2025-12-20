import { useMemo, type RefObject } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
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
}: PLChartProps) {
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

  // Memoize YAxis domain calculation for better performance
  const yAxisDomain = useMemo((): [number, number] => {
    if (!visibleChartData.length) return [-100, 100];

    const plValues = visibleChartData.map(d => d.pl);
    const maxPL = Math.max(...plValues);
    const minPL = Math.min(...plValues);

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
              domain={yAxisDomain}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const plValue = payload[0].payload.pl;
                  const isBreakeven = plValue === 0;
                  const matchingPositions: Position[] = [];
                  for (const [strike, posList] of strikePositionMap.entries()) {
                    if (Math.abs(strike - (label as number)) < 0.5) {
                      matchingPositions.push(...posList);
                    }
                  }
                  return (
                    <div className="bg-[#262626] border border-[#404040] text-[#e5e5e5] rounded-lg p-3 shadow-lg">
                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <span className="text-gray-400">Price:</span>
                        <span className="text-right font-medium">
                          ${Number.isInteger(label) ? label : (label as number).toFixed(2)}
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
          </AreaChart>
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
