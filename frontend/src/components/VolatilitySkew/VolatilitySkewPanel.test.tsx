import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketData } from '../../types';
import VolatilitySkewPanel from './VolatilitySkewPanel';

vi.mock('./VolatilitySkew', () => ({
  default: () => <div data-testid="volatility-skew-content" />,
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const marketData: MarketData = {
  symbol: 'SPY',
  current_price: 600,
  implied_volatility: 0.2,
  iv_rank: 50,
  risk_free_rate: 0.04,
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

describe('VolatilitySkewPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('does not mount chart content while closed on mobile', () => {
    setViewportWidth(500);
    render(
      <VolatilitySkewPanel
        symbol="SPY"
        marketData={marketData}
        selectedExpiration="2026-12-18"
        isDark={false}
      />,
    );

    expect(screen.queryByTestId('volatility-skew-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /volatility skew/i }));

    expect(screen.getAllByTestId('volatility-skew-content')).toHaveLength(1);
  });

  it('mounts exactly one chart instance on desktop', () => {
    setViewportWidth(1024);
    render(
      <VolatilitySkewPanel
        symbol="SPY"
        marketData={marketData}
        selectedExpiration="2026-12-18"
        isDark={false}
      />,
    );

    expect(screen.getAllByTestId('volatility-skew-content')).toHaveLength(1);
  });
});
