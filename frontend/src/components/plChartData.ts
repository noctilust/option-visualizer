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
