import { describe, expect, it } from 'vitest';
import { withProfitLossSegments } from './plChartData';

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
