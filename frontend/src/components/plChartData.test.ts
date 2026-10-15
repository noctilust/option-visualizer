import { describe, expect, it } from 'vitest';
import { withProfitLossSegments, priceRangesAtOrAbove, priceAxisTicks, defaultPriceWindow, plYDomain } from './plChartData';

describe('defaultPriceWindow', () => {
  it('pads the key prices by 20% of their span, at least 1% of price', () => {
    expect(defaultPriceWindow([150, 250, 180, 220])).toEqual({ low: 130, high: 270 });
    const window = defaultPriceWindow([734.8, 740, 769.6])!;
    expect(window.low).toBeCloseTo(727.28, 2);
    expect(window.high).toBeCloseTo(777.12, 2);
  });

  it('ignores missing prices', () => {
    expect(defaultPriceWindow([0, NaN])).toBeNull();
  });
});

describe('plYDomain', () => {
  it('fits the visible values instead of mirroring around zero', () => {
    expect(plYDomain([521, -1000, 260])).toEqual([-1000 - 182.52, 521 + 182.52]);
  });

  it('keeps zero in view', () => {
    expect(plYDomain([200, 500])).toEqual([-60, 560]);
  });
});

describe('priceAxisTicks', () => {
  it('spaces ticks on round intervals covering the span', () => {
    expect(priceAxisTicks(692, 846)).toEqual([680, 700, 720, 740, 760, 780, 800, 820, 840, 860]);
  });

  it('handles a flat or missing span', () => {
    expect(priceAxisTicks(100, 100)).toEqual([100]);
    expect(priceAxisTicks(NaN, 100)).toEqual([]);
  });
});

describe('priceRangesAtOrAbove', () => {
  it('interpolates where a tent-shaped curve crosses the threshold', () => {
    const ranges = priceRangesAtOrAbove([
      { price: 90, value: -100 },
      { price: 100, value: 300 },
      { price: 110, value: -100 },
    ], 100);
    expect(ranges).toEqual([{ low: 95, high: 105 }]);
  });

  it('returns separate zones and keeps open-ended edges', () => {
    const ranges = priceRangesAtOrAbove([
      { price: 1, value: 200 },
      { price: 2, value: 0 },
      { price: 3, value: 0 },
      { price: 4, value: 200 },
    ], 100);
    expect(ranges).toEqual([{ low: 1, high: 1.5 }, { low: 3.5, high: 4 }]);
  });

  it('returns no zones when the curve never reaches the threshold', () => {
    expect(priceRangesAtOrAbove([{ price: 1, value: 50 }, { price: 2, value: undefined }], 100)).toEqual([]);
  });
});

describe('withProfitLossSegments', () => {
  it('adds a shared zero point where profit and loss segments cross', () => {
    const result = withProfitLossSegments([
      { price: 130, pl: -100, pl_at_date: -40 },
      { price: 132, pl: 100, pl_at_date: 20 },
    ]);

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({
      price: 131,
      pl: 0,
      pl_at_date: -10,
      profit: 0,
      loss: 0,
    });
  });

  it('shares an existing zero point without inserting a duplicate', () => {
    const result = withProfitLossSegments([
      { price: 130, pl: -100 },
      { price: 131, pl: 0 },
      { price: 132, pl: 100 },
    ]);

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ profit: 0, loss: 0 });
  });
});
