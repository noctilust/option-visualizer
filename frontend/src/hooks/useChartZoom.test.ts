import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChartDataPoint, Position } from '../types';
import { createZoomStore, useChartZoom, useZoomRange } from './useChartZoom';

const chartData: ChartDataPoint[] = Array.from({ length: 201 }, (_, i) => ({
  price: 100 + i,
  pl: 50 - Math.abs(i - 100),
}));
const positions: Position[] = [
  { id: 'a', qty: -1, expiration: 'Nov 20 26', strike: 180, type: 'P' },
  { id: 'b', qty: -1, expiration: 'Nov 20 26', strike: 220, type: 'C' },
];

describe('createZoomStore', () => {
  it('notifies subscribers only when the range changes', () => {
    const store = createZoomStore({ startIndex: 0, endIndex: 10 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ startIndex: 0, endIndex: 10 });
    expect(listener).not.toHaveBeenCalled();

    store.set(current => ({ startIndex: current.startIndex + 1, endIndex: current.endIndex + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ startIndex: 1, endIndex: 11 });
  });
});

describe('useChartZoom', () => {
  it('frames the profit zone without re-rendering the owner on zoom', () => {
    let ownerRenders = 0;
    const { result } = renderHook(() => {
      ownerRenders++;
      return useChartZoom({ chartData, positions });
    });
    const { result: subscriber } = renderHook(() => useZoomRange(result.current.zoomStore));

    // Breakevens at 150 and 250 bound the key prices; 20% padding gives $130–$270
    expect(subscriber.current).toEqual({ startIndex: 30, endIndex: 170 });

    const rendersBefore = ownerRenders;
    act(() => result.current.handleZoomIn());
    expect(subscriber.current).toEqual({ startIndex: 44, endIndex: 156 });
    expect(ownerRenders).toBe(rendersBefore);

    act(() => result.current.handleResetZoom());
    expect(subscriber.current).toEqual({ startIndex: 30, endIndex: 170 });
  });

  it('frames a one-sided payoff around its breakeven, strike and spot', () => {
    const shortPut: ChartDataPoint[] = Array.from({ length: 401 }, (_, i) => {
      const price = 600 + i;
      return { price, pl: 521 - Math.max(0, 740 - price) * 100 };
    });
    const { result } = renderHook(() => useChartZoom({
      chartData: shortPut,
      positions: [{ id: 'p', qty: -1, expiration: 'Nov 20 26', strike: 740, type: 'P' }],
      currentPrice: 769.6,
    }));
    const range = result.current.zoomStore.get();
    // Breakeven $734.79 and spot $769.60 with ~1% padding
    expect(shortPut[range.startIndex].price).toBe(727);
    expect(shortPut[range.endIndex].price).toBe(778);
  });
});
