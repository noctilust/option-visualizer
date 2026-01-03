import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import type { SmileData } from '../../types';

interface SmileChartProps {
  data: SmileData;
  isDark: boolean;
}

export default function SmileChart({ data, isDark }: SmileChartProps) {
  // Format data for Recharts
  const chartData = useMemo(() => {
    return data.points.map(point => ({
      strike: point.strike,
      callIV: point.call_iv ? point.call_iv * 100 : null, // Convert to percentage
      putIV: point.put_iv ? point.put_iv * 100 : null,
      callDelta: point.call_delta,
      putDelta: point.put_delta,
      callBid: point.call_bid,
      callAsk: point.call_ask,
      putBid: point.put_bid,
      putAsk: point.put_ask,
    }));
  }, [data.points]);

  // Calculate Y-axis domain with padding
  const yAxisDomain = useMemo((): [number, number] => {
    const allIvs: number[] = [];
    chartData.forEach(d => {
      if (d.callIV) allIvs.push(d.callIV);
      if (d.putIV) allIvs.push(d.putIV);
    });

    if (allIvs.length === 0) return [0, 100];

    const minIV = Math.min(...allIvs);
    const maxIV = Math.max(...allIvs);
    const padding = (maxIV - minIV) * 0.15 || 10;

    return [Math.max(0, minIV - padding), maxIV + padding];
  }, [chartData]);

  // Calculate X-axis ticks (strike prices)
  const xAxisTicks = useMemo(() => {
    const strikes = chartData.map(d => d.strike);
    if (strikes.length === 0) return [];

    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const range = maxStrike - minStrike;

    // Aim for ~8-10 ticks
    const tickCount = Math.min(10, Math.max(5, Math.ceil(range / 50)));
    const step = range / tickCount;

    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const tick = Math.round((minStrike + step * i) / 5) * 5; // Round to nearest 5
      if (tick >= minStrike && tick <= maxStrike) {
        ticks.push(tick);
      }
    }

    return [...new Set(ticks)].sort((a, b) => a - b);
  }, [chartData]);

  // Calculate X-axis domain (min/max strike)
  const xAxisDomain = useMemo((): [number, number] => {
    const strikes = chartData.map(d => d.strike);
    if (strikes.length === 0) return [0, 100];
    return [Math.min(...strikes), Math.max(...strikes)];
  }, [chartData]);

  const colors = {
    callLine: isDark ? '#10b981' : '#059669',    // green
    putLine: isDark ? '#ef4444' : '#dc2626',     // red
    currentPriceLine: isDark ? '#6366f1' : '#4f46e5', // indigo
    atmMarker: isDark ? '#f59e0b' : '#d97706',   // amber
    grid: isDark ? '#404040' : '#e5e7eb',
    text: isDark ? '#9ca3af' : '#6b7280',
    tooltipBg: isDark ? '#262626' : '#ffffff',
    tooltipBorder: isDark ? '#404040' : '#e5e7eb',
    tooltipText: isDark ? '#e5e5e5' : '#1f2937',
  };

  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={chartData}
          margin={{ top: 40, right: 20, left: 25, bottom: 30 }}
        >
          <CartesianGrid
            stroke={colors.grid}
            vertical={false}
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />

          <XAxis
            dataKey="strike"
            type="number"
            domain={xAxisDomain}
            ticks={xAxisTicks}
            stroke={colors.text}
            tick={{ fill: colors.text, fontSize: 11 }}
            axisLine={{ stroke: colors.grid }}
            tickLine={{ stroke: colors.grid }}
            tickFormatter={(value) => `$${value}`}
            label={{
              value: 'Strike Price',
              position: 'insideBottom',
              offset: -10,
              fill: colors.text,
              fontSize: 12,
            }}
          />

          <YAxis
            stroke={colors.text}
            tick={{ fill: colors.text, fontSize: 11 }}
            axisLine={{ stroke: colors.grid }}
            tickLine={{ stroke: colors.grid }}
            domain={yAxisDomain}
            width={50}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
            label={{
              value: 'Implied Volatility (%)',
              angle: -90,
              position: 'center',
              dx: -30,
              fill: colors.text,
              fontSize: 12,
            }}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length > 0) {
                const data = payload[0].payload;

                // Format IV as percentage - handle both decimal (0.19) and percentage (19) formats
                const formatIV = (iv: number | null) => {
                  if (iv === null) return null;
                  // If IV is less than 1, it's in decimal format - multiply by 100
                  // If IV is 1 or more, it's already in percentage format
                  const ivValue = iv < 1 ? iv * 100 : iv;
                  return `${ivValue.toFixed(1)}%`;
                };

                return (
                  <div
                    className="rounded-lg p-3 shadow-lg"
                    style={{
                      backgroundColor: colors.tooltipBg,
                      border: `1px solid ${colors.tooltipBorder}`,
                      color: colors.tooltipText,
                    }}
                  >
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium">Strike:</span>
                      <span className="text-right font-semibold">${data.strike}</span>

                      {data.callIV !== null && data.callIV !== undefined && (
                        <>
                          <span style={{ color: colors.callLine }}>Call IV:</span>
                          <span className="text-right" style={{ color: colors.callLine }}>
                            {formatIV(data.callIV)}
                          </span>
                        </>
                      )}

                      {data.putIV !== null && data.putIV !== undefined && (
                        <>
                          <span style={{ color: colors.putLine }}>Put IV:</span>
                          <span className="text-right" style={{ color: colors.putLine }}>
                            {formatIV(data.putIV)}
                          </span>
                        </>
                      )}

                      {data.callDelta !== null && data.callDelta !== undefined && (
                        <>
                          <span className="text-muted-foreground">Call Delta:</span>
                          <span className="text-right">{data.callDelta.toFixed(3)}</span>
                        </>
                      )}

                      {data.putDelta !== null && data.putDelta !== undefined && (
                        <>
                          <span className="text-muted-foreground">Put Delta:</span>
                          <span className="text-right">{data.putDelta.toFixed(3)}</span>
                        </>
                      )}

                      {data.callBid !== null && data.callAsk !== null && (
                        <>
                          <span className="text-muted-foreground">Call:</span>
                          <span className="text-right">
                            ${data.callBid?.toFixed(2)} / ${data.callAsk?.toFixed(2)}
                          </span>
                        </>
                      )}

                      {data.putBid !== null && data.putAsk !== null && (
                        <>
                          <span className="text-muted-foreground">Put:</span>
                          <span className="text-right">
                            ${data.putBid?.toFixed(2)} / ${data.putAsk?.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          {/* Current price reference line */}
          <ReferenceLine
            x={data.current_price}
            stroke={colors.currentPriceLine}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />

          {/* ATM IV reference line */}
          {data.atm_iv > 0 && (
            <ReferenceLine
              y={data.atm_iv * 100}
              stroke={colors.atmMarker}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          )}

          {/* Current price dot on x-axis */}
          <ReferenceDot
            x={data.current_price}
            y={0}
            r={0}
            label={{
              content: ({ viewBox }) => {
                if (!viewBox) return null;
                const { x } = viewBox as { x: number };
                return (
                  <g>
                    <circle
                      cx={x}
                      cy={0}
                      r={4}
                      fill={colors.currentPriceLine}
                      stroke={isDark ? '#fff' : '#fff'}
                      strokeWidth={2}
                    />
                  </g>
                );
              }
            }}
          />

          {/* ATM IV marker */}
          {data.atm_iv > 0 && (
            <ReferenceDot
              x={data.current_price}
              y={data.atm_iv * 100}
              r={5}
              fill={colors.atmMarker}
              stroke={isDark ? '#fff' : '#fff'}
              strokeWidth={2}
            />
          )}

          {/* Call IV line */}
          <Line
            type="monotone"
            dataKey="callIV"
            stroke={colors.callLine}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, stroke: isDark ? '#fff' : '#fff', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Put IV line */}
          <Line
            type="monotone"
            dataKey="putIV"
            stroke={colors.putLine}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, stroke: isDark ? '#fff' : '#fff', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
