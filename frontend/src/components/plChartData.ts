import type { ChartDataPoint } from '../types';

function interpolateOptional(
  start: number | undefined,
  end: number | undefined,
  ratio: number,
): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  return start + (end - start) * ratio;
}

function addSegmentValues(point: ChartDataPoint): ChartDataPoint {
  return {
    ...point,
    profit: point.pl >= 0 ? point.pl : undefined,
    loss: point.pl <= 0 ? point.pl : undefined,
  };
}

export function withProfitLossSegments(points: ChartDataPoint[]): ChartDataPoint[] {
  const result: ChartDataPoint[] = [];

  points.forEach((point, index) => {
    result.push(addSegmentValues(point));

    const nextPoint = points[index + 1];
    if (!nextPoint || point.pl * nextPoint.pl >= 0) return;

    const ratio = -point.pl / (nextPoint.pl - point.pl);
    result.push(addSegmentValues({
      ...point,
      price: point.price + (nextPoint.price - point.price) * ratio,
      pl: 0,
      theoretical_pl: interpolateOptional(point.theoretical_pl, nextPoint.theoretical_pl, ratio),
      pl_at_date: interpolateOptional(point.pl_at_date, nextPoint.pl_at_date, ratio),
      delta: interpolateOptional(point.delta, nextPoint.delta, ratio),
      gamma: interpolateOptional(point.gamma, nextPoint.gamma, ratio),
      theta: interpolateOptional(point.theta, nextPoint.theta, ratio),
      vega: interpolateOptional(point.vega, nextPoint.vega, ratio),
    }));
  });

  return result;
}

/** Prices where the expiration P/L crosses zero, linearly interpolated */
export function findBreakevenPrices(chartData: ChartDataPoint[]): number[] {
  const prices: number[] = [];
  for (let i = 0; i < chartData.length - 1; i++) {
    const p1 = chartData[i];
    const p2 = chartData[i + 1];
    if ((p1.pl >= 0 && p2.pl < 0) || (p1.pl < 0 && p2.pl >= 0)) {
      prices.push(p1.price + (p2.price - p1.price) * ((0 - p1.pl) / (p2.pl - p1.pl)));
    }
  }
  return prices;
}

/**
 * Tightest price window that still shows every key price (breakevens, strikes,
 * spot) with a little context on each side, so the profit zone and breakevens
 * fill the chart instead of distant flat payoff.
 */
export function defaultPriceWindow(keyPrices: number[]): { low: number; high: number } | null {
  const prices = keyPrices.filter(p => Number.isFinite(p) && p > 0);
  if (!prices.length) return null;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const padding = Math.max((high - low) * 0.2, ((low + high) / 2) * 0.01);
  return { low: low - padding, high: high + padding };
}

/**
 * Y range fitted to the visible values plus zero, with headroom for the labels
 * drawn above and below the zero line.
 */
export function plYDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [-100, 100];
  const max = Math.max(0, ...finite);
  const min = Math.min(0, ...finite);
  if (max === min) return [min - 100, max + 100];
  const padding = (max - min) * 0.12;
  return [min - padding, max + padding];
}

/** Roughly 8 evenly spaced ticks on 1/2/5×10ⁿ boundaries covering the price span */
export function priceAxisTicks(minPrice: number, maxPrice: number): number[] {
  const range = maxPrice - minPrice;
  if (!Number.isFinite(range)) return [];
  if (range === 0) return [minPrice];

  const rawInterval = range / 8;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const normalized = rawInterval / magnitude;

  let interval: number;
  if (normalized < 1.5) interval = 1 * magnitude;
  else if (normalized < 3.5) interval = 2 * magnitude;
  else if (normalized < 7.5) interval = 5 * magnitude;
  else interval = 10 * magnitude;

  const ticks: number[] = [];
  const endTick = Math.ceil(maxPrice / interval) * interval;
  for (let p = Math.floor(minPrice / interval) * interval; p <= endTick; p += interval) {
    ticks.push(p);
  }
  return ticks;
}

export interface PriceRange {
  low: number;
  high: number;
}

/**
 * Contiguous price ranges where a curve is at or above `threshold`, with
 * linearly interpolated crossing points. Points must be sorted by price.
 */
export function priceRangesAtOrAbove(
  curve: { price: number; value: number | undefined }[],
  threshold: number,
): PriceRange[] {
  const ranges: PriceRange[] = [];
  let low: number | null = null;
  let prev: { price: number; value: number } | null = null;

  for (const point of curve) {
    if (point.value === undefined || Number.isNaN(point.value)) continue;
    const current = { price: point.price, value: point.value };
    const above = current.value >= threshold;

    if (prev === null) {
      if (above) low = current.price;
    } else {
      const prevAbove = prev.value >= threshold;
      if (above !== prevAbove) {
        const ratio = (threshold - prev.value) / (current.value - prev.value);
        const crossing = prev.price + (current.price - prev.price) * ratio;
        if (above) {
          low = crossing;
        } else if (low !== null) {
          ranges.push({ low, high: crossing });
          low = null;
        }
      }
    }
    prev = current;
  }

  if (low !== null && prev !== null) {
    ranges.push({ low, high: prev.price });
  }
  return ranges;
}
