import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkewData } from '../types';
import {
  clearVolatilitySkewCache,
  useVolatilitySkew,
} from './useVolatilitySkew';

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
    current_price: 500,
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

describe('useVolatilitySkew', () => {
  beforeEach(() => {
    clearVolatilitySkewCache();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearVolatilitySkewCache();
  });

  it('deduplicates in-flight requests and shares fresh results across hook instances', async () => {
    const expiration = '2099-08-21';
    const response = deferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useVolatilitySkew());
    const second = renderHook(() => useVolatilitySkew());
    let firstRequest: Promise<SkewData | null>;
    let secondRequest: Promise<SkewData | null>;

    act(() => {
      firstRequest = first.result.current.fetchSkewData('spy', expiration);
      secondRequest = second.result.current.fetchSkewData('SPY', expiration);
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      response.resolve(jsonResponse({ data: makeSkewData(expiration, 0.21) }));
      await Promise.all([firstRequest, secondRequest]);
    });

    expect(first.result.current.skewData?.atm_iv).toBe(0.21);
    expect(second.result.current.skewData?.atm_iv).toBe(0.21);

    await act(async () => {
      await first.result.current.fetchSkewData('SPY', expiration);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.result.current.loading).toBe(false);
  });

  it('caches a superseded response without letting it overwrite the active cycle', async () => {
    const olderExpiration = '2099-08-21';
    const activeExpiration = '2099-09-18';
    const olderResponse = deferred<Response>();
    const activeResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const expiration = new URL(String(input), 'http://localhost')
        .searchParams.get('expiration');
      return expiration === olderExpiration
        ? olderResponse.promise
        : activeResponse.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVolatilitySkew());
    let olderRequest: Promise<SkewData | null>;
    let activeRequest: Promise<SkewData | null>;

    act(() => {
      olderRequest = result.current.fetchSkewData('SPY', olderExpiration);
      activeRequest = result.current.fetchSkewData('SPY', activeExpiration);
    });

    await act(async () => {
      activeResponse.resolve(jsonResponse({
        data: makeSkewData(activeExpiration, 0.32),
      }));
      await activeRequest;
    });
    expect(result.current.skewData?.expiration).toBe(activeExpiration);

    await act(async () => {
      olderResponse.resolve(jsonResponse({
        data: makeSkewData(olderExpiration, 0.24),
      }));
      await olderRequest;
    });

    expect(result.current.skewData?.expiration).toBe(activeExpiration);

    await act(async () => {
      await result.current.fetchSkewData('SPY', olderExpiration);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.skewData?.expiration).toBe(olderExpiration);
    expect(result.current.skewData?.atm_iv).toBe(0.24);
  });

  it('prefetches without disturbing the active chart and serves the warmed cycle instantly', async () => {
    const nearExpiration = '2099-08-21';
    const farExpiration = '2099-09-18';
    const farResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const expiration = new URL(String(input), 'http://localhost')
        .searchParams.get('expiration');
      if (expiration === farExpiration) return farResponse.promise;

      return Promise.resolve(jsonResponse({
        data: makeSkewData(nearExpiration, 0.21),
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVolatilitySkew());
    await act(async () => {
      await result.current.fetchSkewData('SPY', nearExpiration);
    });

    let prefetchRequest: Promise<SkewData | null>;
    act(() => {
      prefetchRequest = result.current.prefetchSkewData('SPY', farExpiration);
    });

    expect(result.current.skewData?.expiration).toBe(nearExpiration);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      farResponse.resolve(jsonResponse({
        data: makeSkewData(farExpiration, 0.29),
      }));
      await prefetchRequest;
    });

    expect(result.current.skewData?.expiration).toBe(nearExpiration);

    await act(async () => {
      await result.current.fetchSkewData('SPY', farExpiration);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.skewData?.expiration).toBe(farExpiration);
    expect(result.current.loading).toBe(false);
  });

  it('refreshes after five minutes while preserving the cached chart', async () => {
    const expiration = '2099-08-21';
    const refreshResponse = deferred<Response>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: makeSkewData(expiration, 0.21),
      }))
      .mockReturnValueOnce(refreshResponse.promise);
    vi.stubGlobal('fetch', fetchMock);

    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { result } = renderHook(() => useVolatilitySkew());

    await act(async () => {
      await result.current.fetchSkewData('SPY', expiration);
    });

    now += 5 * 60 * 1000 + 1;
    let refreshRequest: Promise<SkewData | null>;
    act(() => {
      refreshRequest = result.current.fetchSkewData('SPY', expiration);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    expect(result.current.skewData?.atm_iv).toBe(0.21);

    await act(async () => {
      refreshResponse.resolve(jsonResponse({
        data: makeSkewData(expiration, 0.25),
      }));
      await refreshRequest;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.skewData?.atm_iv).toBe(0.25);
  });

  it('negative-caches quote-less cycles for 45 seconds without replacing the chart', async () => {
    const selectedExpiration = '2099-08-21';
    const unavailableExpiration = '2099-08-10';
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const expiration = new URL(String(input), 'http://localhost')
        .searchParams.get('expiration');
      const data = expiration === unavailableExpiration
        ? {
            ...makeSkewData(unavailableExpiration, 0),
            data_status: 'no_quotes' as const,
          }
        : makeSkewData(selectedExpiration, 0.21);
      return Promise.resolve(jsonResponse({ data }));
    });
    vi.stubGlobal('fetch', fetchMock);

    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { result } = renderHook(() => useVolatilitySkew());

    await act(async () => {
      await result.current.fetchSkewData('SPY', selectedExpiration);
      await result.current.fetchSkewData('SPY', unavailableExpiration, {
        preserveCurrentOnNoQuotes: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.skewData?.expiration).toBe(selectedExpiration);

    now += 44_999;
    await act(async () => {
      await result.current.fetchSkewData('SPY', unavailableExpiration, {
        preserveCurrentOnNoQuotes: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.skewData?.expiration).toBe(selectedExpiration);

    now += 2;
    await act(async () => {
      await result.current.fetchSkewData('SPY', unavailableExpiration, {
        preserveCurrentOnNoQuotes: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.skewData?.expiration).toBe(selectedExpiration);
  });

  it('does not let a request started before a cache reset repopulate the cache', async () => {
    const expiration = '2099-08-21';
    const staleResponse = deferred<Response>();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(staleResponse.promise)
      .mockResolvedValueOnce(jsonResponse({
        data: makeSkewData(expiration, 0.31),
      }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVolatilitySkew());
    let staleRequest: Promise<SkewData | null>;
    act(() => {
      staleRequest = result.current.prefetchSkewData('SPY', expiration);
    });

    clearVolatilitySkewCache();

    await act(async () => {
      staleResponse.resolve(jsonResponse({
        data: makeSkewData(expiration, 0.20),
      }));
      await staleRequest;
    });

    await act(async () => {
      await result.current.fetchSkewData('SPY', expiration);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.skewData?.atm_iv).toBe(0.31);
  });
});
