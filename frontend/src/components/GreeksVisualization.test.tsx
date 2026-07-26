import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChartDataPoint } from '../types';
import GreeksVisualization from './GreeksVisualization';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const { cloneElement } = await import('react');

  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => cloneElement(children, { width: 800, height: 400 }),
  };
});

const chartData: ChartDataPoint[] = Array.from({ length: 101 }, (_, index) => ({
  price: 50 + index,
  pl: index - 50,
  delta: index / 100,
  gamma: index / 1000,
  theta: -index / 10,
  vega: index / 5,
}));

describe('GreeksVisualization stock-price range', () => {
  it('uses the same adaptive price window as P/L Analysis', () => {
    const adaptiveRangeProps = {
      zoomRange: { startIndex: 36, endIndex: 65 },
    };

    render(
      <GreeksVisualization
        chartData={chartData}
        portfolioGreeks={{
          delta: 0.5,
          gamma: 0.01,
          theta: -5,
          vega: 20,
          rho: 1,
        }}
        marketData={{
          symbol: 'SPY',
          current_price: 100,
          implied_volatility: 0.2,
          iv_rank: 50,
          risk_free_rate: 0.04,
        }}
        {...adaptiveRangeProps}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Greeks vs Stock Price' }),
    ).toBeVisible();
    expect(document.querySelector('.recharts-surface')).not.toBeNull();
    expect(screen.getByText('$86')).toBeVisible();
    expect(screen.getByText('$115')).toBeVisible();
    expect(screen.queryAllByText('$50')).toHaveLength(0);
    expect(screen.queryAllByText('$150')).toHaveLength(0);
  });
});
