import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketData, SkewData } from '../../types';
import { clearVolatilitySkewCache } from '../../hooks/useVolatilitySkew';
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

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function makeSkewData(expiration: string, atmIv: number): SkewData {
  return {
    symbol: 'SPY',
    expiration,
    current_price: 95,
    atm_iv: atmIv,
    skew_metric: null,
    points: [],
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function mockApi(skewData: SkewData) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/option-chain/')
      ? { expirations: [], strikes_by_expiration: {}, underlying_price: 95 }
      : { data: skewData };

    return jsonResponse(body);
  }));
}

describe('VolatilitySkew', () => {
  beforeEach(() => {
    clearVolatilitySkewCache();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    clearVolatilitySkewCache();
    vi.unstubAllGlobals();
  });

  it('loads the near monthly first, then prefetches only the second API monthly', async () => {
    const nearExpiration = '2099-08-21';
    const farExpiration = '2099-09-18';
    const nearResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/option-chain/')) {
        return Promise.resolve(jsonResponse({
            expirations: ['2099-08-07', nearExpiration, '2099-08-28', farExpiration, '2099-10-16'],
            strikes_by_expiration: {},
            underlying_price: 95,
        }));
      }

      const expiration = new URL(url, 'http://localhost').searchParams.get('expiration');
      if (expiration === nearExpiration) return nearResponse.promise;

      return Promise.resolve(jsonResponse({
        data: makeSkewData(expiration ?? farExpiration, 0.27),
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration=""
        isDark={false}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/volatility-skew/SPY?expiration=${nearExpiration}`,
      { method: 'GET' },
    ));
    expect(
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter(url => url.includes('/volatility-skew/')),
    ).toEqual([`/volatility-skew/SPY?expiration=${nearExpiration}`]);

    await act(async () => {
      nearResponse.resolve(jsonResponse({
        data: makeSkewData(nearExpiration, 0.25),
      }));
      await nearResponse.promise;
    });

    await waitFor(() => {
      const skewUrls = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter(url => url.includes('/volatility-skew/'));
      expect(skewUrls).toEqual([
        `/volatility-skew/SPY?expiration=${nearExpiration}`,
        `/volatility-skew/SPY?expiration=${farExpiration}`,
      ]);
    });
  });

  it('does not prefetch generated fallback expirations', async () => {
    const selectedExpiration = '2099-08-21';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/option-chain/')) {
        return jsonResponse({
          expirations: [],
          strikes_by_expiration: {},
          underlying_price: 95,
        });
      }

      return jsonResponse({
        data: makeSkewData(selectedExpiration, 0.22),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration={selectedExpiration}
        isDark={false}
      />,
    );

    expect(await screen.findByText('ATM (22.0%)')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });

    const skewUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter(url => url.includes('/volatility-skew/'));
    expect(skewUrls).toEqual([
      `/volatility-skew/SPY?expiration=${selectedExpiration}`,
    ]);
  });

  it('previews a hovered expiration, restores the selection on leave, and commits on click', async () => {
    const selectedExpiration = '2099-08-21';
    const previewExpiration = '2099-09-18';
    const onExpirationChange = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/option-chain/')) {
        return jsonResponse({
          expirations: [selectedExpiration, previewExpiration],
          strikes_by_expiration: {},
          underlying_price: 95,
        });
      }

      const expiration = new URL(url, 'http://localhost').searchParams.get('expiration');
      return jsonResponse({
        data: makeSkewData(
          expiration ?? selectedExpiration,
          expiration === previewExpiration ? 0.32 : 0.21,
        ),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration={selectedExpiration}
        isDark={false}
        onExpirationChange={onExpirationChange}
      />,
    );

    expect(await screen.findByText('ATM (21.0%)')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Aug 21/ });
    fireEvent.click(trigger);

    const selectedOption = await screen.findByRole('option', { name: /Aug 21/ });
    const previewOption = screen.getByRole('option', { name: /Sep 18/ });
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    expect(previewOption).toHaveAttribute('aria-selected', 'false');

    fireEvent.mouseEnter(previewOption);

    expect(await screen.findByText('ATM (32.0%)')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName(expect.stringMatching(/Aug 21/));
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    expect(previewOption).toHaveAttribute('aria-selected', 'false');
    expect(onExpirationChange).not.toHaveBeenCalled();

    fireEvent.mouseLeave(screen.getByRole('listbox', { name: 'Expiration cycles' }));

    expect(await screen.findByText('ATM (21.0%)')).toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    expect(onExpirationChange).not.toHaveBeenCalled();

    fireEvent.click(previewOption);

    expect(await screen.findByText('ATM (32.0%)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sep 18/ })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Expiration cycles' })).not.toBeInTheDocument();
    expect(onExpirationChange).toHaveBeenCalledOnce();
    expect(onExpirationChange).toHaveBeenCalledWith(previewExpiration);

    await act(async () => {
      await Promise.resolve();
    });

    const skewUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter(url => url.includes('/volatility-skew/'));
    expect(skewUrls).toEqual([
      `/volatility-skew/SPY?expiration=${selectedExpiration}`,
      `/volatility-skew/SPY?expiration=${previewExpiration}`,
    ]);
  });

  it('keeps the selected chart and explains when a hover-preview cycle has no quotes', async () => {
    const selectedExpiration = '2099-08-21';
    const unavailableExpiration = '2099-08-10';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/option-chain/')) {
        return jsonResponse({
          expirations: [unavailableExpiration, selectedExpiration],
          strikes_by_expiration: {},
          underlying_price: 95,
        });
      }

      const expiration = new URL(url, 'http://localhost').searchParams.get('expiration');
      return jsonResponse({
        data: expiration === unavailableExpiration
          ? {
              ...makeSkewData(unavailableExpiration, 0),
              points: [
                { strike: 95, call_iv: null, put_iv: null },
              ],
            }
          : makeSkewData(selectedExpiration, 0.21),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration={selectedExpiration}
        isDark={false}
      />,
    );

    expect(await screen.findByText('ATM (21.0%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Aug 21/ }));
    fireEvent.mouseEnter(await screen.findByRole('option', { name: /Aug 10/ }));

    expect(
      await screen.findByText('No Tastytrade quote data available for Aug 10.'),
    ).toBeInTheDocument();
    expect(screen.getByText('ATM (21.0%)')).toBeInTheDocument();
    expect(screen.queryByText('ATM (0.0%)')).not.toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('listbox', { name: 'Expiration cycles' }));

    await waitFor(() => expect(
      screen.queryByText('No Tastytrade quote data available for Aug 10.'),
    ).not.toBeInTheDocument());
    expect(screen.getByText('ATM (21.0%)')).toBeInTheDocument();
  });

  it('keeps the latest hovered chart when an older preview resolves afterward', async () => {
    const selectedExpiration = '2099-08-21';
    const firstPreviewExpiration = '2099-09-18';
    const latestPreviewExpiration = '2099-10-16';
    const firstPreviewResponse = deferred<Response>();
    const latestPreviewResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/option-chain/')) {
        return Promise.resolve(jsonResponse({
          expirations: [
            selectedExpiration,
            firstPreviewExpiration,
            latestPreviewExpiration,
          ],
          strikes_by_expiration: {},
          underlying_price: 95,
        }));
      }

      const expiration = new URL(url, 'http://localhost').searchParams.get('expiration');
      if (expiration === firstPreviewExpiration) {
        return firstPreviewResponse.promise;
      }
      if (expiration === latestPreviewExpiration) {
        return latestPreviewResponse.promise;
      }

      return Promise.resolve(jsonResponse({
        data: makeSkewData(selectedExpiration, 0.21),
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VolatilitySkew
        symbol="SPY"
        marketData={marketData}
        selectedExpiration={selectedExpiration}
        isDark={false}
      />,
    );

    expect(await screen.findByText('ATM (21.0%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Aug 21/ }));

    fireEvent.mouseEnter(await screen.findByRole('option', { name: /Sep 18/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/volatility-skew/SPY?expiration=${firstPreviewExpiration}`,
      expect.objectContaining({ method: 'GET' }),
    ));
    expect(screen.getByText('ATM (21.0%)')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading Sep 18');

    fireEvent.mouseEnter(screen.getByRole('option', { name: /Oct 16/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/volatility-skew/SPY?expiration=${latestPreviewExpiration}`,
      expect.objectContaining({ method: 'GET' }),
    ));

    await act(async () => {
      latestPreviewResponse.resolve(jsonResponse({
        data: makeSkewData(latestPreviewExpiration, 0.34),
      }));
      await latestPreviewResponse.promise;
    });

    expect(await screen.findByText('ATM (34.0%)')).toBeInTheDocument();

    await act(async () => {
      firstPreviewResponse.resolve(jsonResponse({
        data: makeSkewData(firstPreviewExpiration, 0.27),
      }));
      await firstPreviewResponse.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('ATM (34.0%)')).toBeInTheDocument();
    expect(screen.queryByText('ATM (27.0%)')).not.toBeInTheDocument();
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
