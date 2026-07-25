import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketData, SkewData } from '../../types';
import VolatilitySkew from './VolatilitySkew';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const marketData: MarketData = {
  symbol: 'SPY',
  current_price: 95,
  implied_volatility: 0.2,
  iv_rank: 50,
  risk_free_rate: 0.04,
};

function mockApi(skewData: SkewData) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/option-chain/')
      ? { expirations: [], strikes_by_expiration: {}, underlying_price: 95 }
      : { data: skewData };

    return {
      ok: true,
      json: async () => body,
    } as Response;
  }));
}

describe('VolatilitySkew', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('presents the closest 25-delta put-call IV spread in volatility points', async () => {
    mockApi({
      symbol: 'SPY',
      expiration: '2026-12-18',
      current_price: 95,
      atm_iv: 0.25,
      skew_metric: null,
      points: [
        { strike: 90, call_iv: 0.21, put_iv: 0.32, call_delta: 0.30, put_delta: -0.20 },
        { strike: 95, call_iv: 0.22, put_iv: 0.31, call_delta: 0.26, put_delta: -0.24 },
        { strike: 100, call_iv: 0.23, put_iv: 0.30, call_delta: 0.20, put_delta: -0.30 },
      ],
    });

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration="2026-12-18"
        isDark={false}
      />,
    );

    expect(await screen.findByText('25Δ Put–Call IV Spread')).toBeInTheDocument();
    expect(screen.getByText('+9.0 vol pts')).toBeInTheDocument();
    expect(screen.getByText('Put IV − Call IV')).toBeInTheDocument();
    expect(screen.getByText('Call: $95 · Δ 0.260')).toBeInTheDocument();
    expect(screen.getByText('Put: $95 · Δ -0.240')).toBeInTheDocument();
  });

  it('labels the nearest paired strike as an ATM fallback', async () => {
    mockApi({
      symbol: 'SPY',
      expiration: '2026-12-18',
      current_price: 100,
      atm_iv: 0.28,
      skew_metric: null,
      points: [
        { strike: 95, call_iv: 0.26, put_iv: 0.35, call_delta: 0.65, put_delta: -0.35 },
        { strike: 101, call_iv: 0.24, put_iv: 0.32, call_delta: 0.52, put_delta: -0.48 },
      ],
    });

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={{ ...marketData, current_price: 100 }}
        selectedExpiration="2026-12-18"
        isDark={false}
      />,
    );

    expect(await screen.findByText('ATM Put–Call IV Spread')).toBeInTheDocument();
    expect(screen.getByText('+8.0 vol pts')).toBeInTheDocument();
    expect(screen.getByText('ATM fallback at nearest strike $101')).toBeInTheDocument();
    expect(screen.queryByText('25Δ Put–Call IV Spread')).not.toBeInTheDocument();
  });

  it('states when neither a 25-delta pair nor paired ATM IV is available', async () => {
    mockApi({
      symbol: 'SPY',
      expiration: '2026-12-18',
      current_price: 100,
      atm_iv: 0,
      skew_metric: null,
      points: [
        { strike: 100, call_iv: 0.24, put_iv: null, call_delta: 0.52, put_delta: -0.48 },
      ],
    });

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={{ ...marketData, current_price: 100 }}
        selectedExpiration="2026-12-18"
        isDark={false}
      />,
    );

    expect(await screen.findByText('Put–Call IV Spread')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('No qualifying 25Δ pair or paired ATM IV is available.'),
    ).toBeInTheDocument();
  });
});
