import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { ZoomRange, ChartDataPoint, Position } from '../types';
import { createStore, useStore, type Store } from '../utils/store';
import { defaultPriceWindow, findBreakevenPrices } from '../components/plChartData';

/** Zoom window kept outside React state so panning only re-renders the charts */
export type ZoomStore = Store<ZoomRange>;

export function createZoomStore(initial: ZoomRange = { startIndex: 0, endIndex: 0 }): ZoomStore {
  return createStore(initial, (a, b) => a.startIndex === b.startIndex && a.endIndex === b.endIndex);
}

export const useZoomRange: (store: ZoomStore) => ZoomRange = useStore;

interface UseChartZoomProps {
  chartData: ChartDataPoint[];
  positions: Position[];
  currentPrice?: number;
}

interface UseChartZoomReturn {
  zoomStore: ZoomStore;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleChartMouseDown: (e: React.MouseEvent) => void;
  handleChartMouseMove: (e: React.MouseEvent) => void;
  handleChartMouseUp: () => void;
  handleChartMouseLeave: () => void;
}

function defaultZoomRange(
  chartData: ChartDataPoint[],
  positions: Position[],
  breakevenPrices: number[],
  currentPrice: number | undefined,
): ZoomRange {
  const fullRange = { startIndex: 0, endIndex: chartData.length - 1 };
  const window = defaultPriceWindow([
    ...breakevenPrices,
    ...positions.map(p => p.strike),
    ...(currentPrice ? [currentPrice] : []),
  ]);
  if (!window) return fullRange;

  // Widen to the nearest data points outside the window
  let startIndex = 0;
  for (let i = 0; i < chartData.length && chartData[i].price <= window.low; i++) startIndex = i;
  let endIndex = chartData.findIndex(d => d.price >= window.high);
  if (endIndex === -1) endIndex = chartData.length - 1;
  return endIndex > startIndex ? { startIndex, endIndex } : fullRange;
}

export function useChartZoom({ chartData, positions, currentPrice }: UseChartZoomProps): UseChartZoomReturn {
  const [zoomStore] = useState(() => createZoomStore());

  // Spot frames the default window but quote updates shouldn't reset the zoom
  const currentPriceRef = useRef(currentPrice);
  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Drag-to-pan state
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<ZoomRange>({ startIndex: 0, endIndex: 0 });
  const pendingRangeRef = useRef<ZoomRange | null>(null);
  const frameRef = useRef<number | null>(null);

  // Track positions fingerprint to only reset zoom when strategy fundamentally changes
  const positionsFingerprintRef = useRef<string>('');
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (chartData.length === 0 || positions.length === 0) return;

    const breakevenPrices = findBreakevenPrices(chartData);
    // Breakevens move with the credit, so they're part of the fingerprint
    const positionsKey = positions.map(p => `${p.strike}-${p.type}-${p.qty}`).sort().join('|');
    const breakevenKey = breakevenPrices.map(p => Math.round(p * 100) / 100).sort((a, b) => a - b).join(',');
    const newFingerprint = `${positionsKey}::${breakevenKey}`;

    if (!hasInitializedRef.current || newFingerprint !== positionsFingerprintRef.current) {
      positionsFingerprintRef.current = newFingerprint;
      hasInitializedRef.current = true;
      zoomStore.set(defaultZoomRange(chartData, positions, breakevenPrices, currentPriceRef.current));
    }
  }, [chartData, positions, zoomStore]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const handleZoomIn = useCallback(() => {
    zoomStore.set(current => {
      const range = current.endIndex - current.startIndex;
      if (range <= 2) return current; // Prevent zooming in too much

      const zoomFactor = Math.floor(range * 0.1) || 1;
      const newStart = Math.min(current.startIndex + zoomFactor, current.endIndex - 2);
      const newEnd = Math.max(current.endIndex - zoomFactor, current.startIndex + 2);

      return { startIndex: newStart, endIndex: newEnd };
    });
  }, [zoomStore]);

  const handleZoomOut = useCallback(() => {
    zoomStore.set(current => {
      const totalPoints = chartData.length;
      const range = current.endIndex - current.startIndex;

      if (current.startIndex === 0 && current.endIndex === totalPoints - 1) return current;

      const zoomFactor = Math.floor(range * 0.1) || 1;
      return {
        startIndex: Math.max(0, current.startIndex - zoomFactor),
        endIndex: Math.min(totalPoints - 1, current.endIndex + zoomFactor),
      };
    });
  }, [chartData.length, zoomStore]);

  const handleResetZoom = useCallback(() => {
    if (chartData.length > 0 && positions.length > 0) {
      zoomStore.set(defaultZoomRange(chartData, positions, findBreakevenPrices(chartData), currentPriceRef.current));
    } else if (chartData.length > 0) {
      zoomStore.set({ startIndex: 0, endIndex: chartData.length - 1 });
    }
  }, [chartData, positions, zoomStore]);

  const setDragging = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
    const container = chartContainerRef.current;
    if (!container) return;
    container.style.cursor = dragging ? 'grabbing' : 'grab';
    // Lets the chart skip tooltip hit-testing while panning
    if (dragging) container.dataset.dragging = 'true';
    else delete container.dataset.dragging;
  }, []);

  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent native drag/selection behavior
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = zoomStore.get();
    setDragging(true);
  }, [setDragging, zoomStore]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX = e.clientX - dragStartXRef.current;
    const { startIndex: startIdx, endIndex: endIdx } = dragStartRangeRef.current;
    const pixelsPerPoint = rect.width / (endIdx - startIdx);

    // Dragging left reveals higher prices
    const shift = Math.round(-deltaX / pixelsPerPoint);
    const totalPoints = chartData.length;
    let newStart = startIdx + shift;
    let newEnd = endIdx + shift;

    if (newStart < 0) {
      newEnd = newEnd - newStart;
      newStart = 0;
    }
    if (newEnd > totalPoints - 1) {
      newStart = newStart - (newEnd - (totalPoints - 1));
      newEnd = totalPoints - 1;
    }

    // Mouse events can fire several times per frame; render at most once per frame
    pendingRangeRef.current = { startIndex: Math.max(0, newStart), endIndex: Math.min(totalPoints - 1, newEnd) };
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (pendingRangeRef.current) zoomStore.set(pendingRangeRef.current);
        pendingRangeRef.current = null;
      });
    }
  }, [chartData.length, zoomStore]);

  const handleChartMouseUp = useCallback(() => setDragging(false), [setDragging]);
  const handleChartMouseLeave = useCallback(() => setDragging(false), [setDragging]);

  return {
    zoomStore,
    chartContainerRef,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleChartMouseDown,
    handleChartMouseMove,
    handleChartMouseUp,
    handleChartMouseLeave,
  };
}
