import { DefaultZIndexes, ZIndexLayer, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import type { Position } from '../types';

export interface PLChartColors {
  grid: string;
  gridDashed: string;
  zero: string;
  label: string;
  positive: string;
  negative: string;
  accent: string;
}

interface PLChartMarkersProps {
  ticks: number[];
  positions: Position[];
  breakevens: number[];
  currentPrice: number | null;
  colors: PLChartColors;
  isDark: boolean;
}

/**
 * Grid lines, price labels, strike flags, breakevens and the spot marker drawn
 * as plain SVG in two layers. Rendering these as dozens of Reference* elements
 * made every pan/zoom frame re-register each one with the chart.
 */
export default function PLChartMarkers({ ticks, positions, breakevens, currentPrice, colors, isDark }: PLChartMarkersProps) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const zeroY = yScale?.(0);
  if (!plot || !xScale || zeroY === undefined) return null;

  const top = plot.y;
  const bottom = plot.y + plot.height;
  const toX = (price: number): number | null => {
    const x = xScale(price);
    return x !== undefined && x >= plot.x - 0.5 && x <= plot.x + plot.width + 0.5 ? x : null;
  };
  const spotX = currentPrice ? toX(currentPrice) : null;

  return (
    <>
      <ZIndexLayer zIndex={DefaultZIndexes.grid}>
        <g className="pl-chart-grid">
          {ticks.map(tick => {
            const x = toX(tick);
            return x === null ? null : (
              <line key={tick} x1={x} x2={x} y1={top} y2={bottom} stroke={colors.gridDashed} strokeDasharray="3 3" strokeOpacity={0.4} />
            );
          })}
        </g>
      </ZIndexLayer>
      <ZIndexLayer zIndex={DefaultZIndexes.scatter}>
        <g className="pl-chart-markers">
          {ticks.map(tick => {
            const x = toX(tick);
            return x === null ? null : (
              <text key={tick} x={x} y={zeroY - 6} textAnchor="middle" fill={colors.label} fontSize={11}>
                ${Math.round(tick)}
              </text>
            );
          })}

          {positions.map(pos => {
            const x = toX(pos.strike);
            if (x === null) return null;
            const flagText = `${pos.qty > 0 ? '+' : ''}${pos.qty}${pos.type}`;
            const boxWidth = flagText.length * 7 + 10;
            const boxHeight = 16;
            return (
              <g key={pos.id}>
                <rect
                  x={x - boxWidth / 2}
                  y={zeroY + 4}
                  width={boxWidth}
                  height={boxHeight}
                  fill={isDark ? '#262626' : '#f5f5f5'}
                  stroke={colors.grid}
                  strokeWidth={1}
                  rx={2}
                  ry={2}
                />
                <rect
                  x={x - boxWidth / 2}
                  y={zeroY + 4}
                  width={3}
                  height={boxHeight}
                  fill={pos.qty > 0 ? colors.positive : colors.negative}
                  rx={2}
                  ry={0}
                />
                <text x={x + 2} y={zeroY + 16} textAnchor="middle" fill={colors.zero} fontSize={10} fontWeight={500}>
                  {flagText}
                </text>
              </g>
            );
          })}

          {spotX !== null && currentPrice && (
            <g>
              <line x1={spotX} x2={spotX} y1={top} y2={bottom} stroke={colors.accent} strokeWidth={1} strokeDasharray="4 2" />
              <circle cx={spotX} cy={zeroY} r={4} fill={colors.accent} stroke="#fff" strokeWidth={2} />
              <text x={spotX} y={zeroY + 18} textAnchor="middle" fill={colors.accent} fontSize={11} fontWeight={600}>
                ${currentPrice.toFixed(2)}
              </text>
            </g>
          )}

          {breakevens.map(price => {
            const x = toX(price);
            return x === null ? null : (
              <g key={price}>
                <circle cx={x} cy={zeroY} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
                <rect
                  x={x - 35}
                  y={zeroY - 28}
                  width={70}
                  height={18}
                  fill={isDark ? '#78350f' : '#fef3c7'}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  rx={4}
                  ry={4}
                />
                <text x={x} y={zeroY - 16} textAnchor="middle" fill={isDark ? '#fbbf24' : '#b45309'} fontSize={10} fontWeight={600}>
                  BE: ${price.toFixed(2)}
                </text>
              </g>
            );
          })}
        </g>
      </ZIndexLayer>
    </>
  );
}
