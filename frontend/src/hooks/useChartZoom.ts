import { useState, useRef, useCallback, useEffect, useMemo, type RefObject } from 'react';
import type { ZoomRange, ChartDataPoint, Position } from '../types';

interface UseChartZoomProps {
  chartData: ChartDataPoint[];
  positions: Position[];
}

interface UseChartZoomReturn {
  zoomRange: ZoomRange;
  setZoomRange: React.Dispatch<React.SetStateAction<ZoomRange>>;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleChartMouseDown: (e: React.MouseEvent) => void;
  handleChartMouseMove: (e: React.MouseEvent) => void;
  handleChartMouseUp: () => void;
  handleChartMouseLeave: () => void;
  xAxisTicks: number[];
}

export function useChartZoom({ chartData, positions }: UseChartZoomProps): UseChartZoomReturn {
  const [zoomRange, setZoomRange] = useState<ZoomRange>({ startIndex: 0, endIndex: 0 });

  // Drag-to-pan state
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<ZoomRange>({ startIndex: 0, endIndex: 0 });

  // Track positions fingerprint to only reset zoom when strategy fundamentally changes
  const positionsFingerprintRef = useRef<string>('');
  const hasInitializedRef = useRef(false);

  // Reset zoom when chart data changes, with smart default based on profit zone
  // Only reset when positions actually change, not on every recalculation
  useEffect(() => {
    if (chartData.length === 0) return;

    // Generate a fingerprint of current positions (strikes and types)
    const newFingerprint = positions.map(p => `${p.strike}-${p.type}-${p.qty}`).sort().join('|');
    const positionsChanged = newFingerprint !== positionsFingerprintRef.current;

    // Only reset zoom if:
    // 1. This is the first time we're getting chart data (initial load)
    // 2. The positions have fundamentally changed (different strikes/types)
    if (!hasInitializedRef.current || positionsChanged) {
      positionsFingerprintRef.current = newFingerprint;
      hasInitializedRef.current = true;

      // Find profit zone indices
      const firstProfitIndex = chartData.findIndex(d => d.pl > 0);
      const lastProfitIndex = chartData.findLastIndex(d => d.pl > 0);

      if (firstProfitIndex !== -1 && lastProfitIndex !== -1) {
        const profitWidth = lastProfitIndex - firstProfitIndex;
        const padding = Math.floor(profitWidth * 0.5); // 50% padding on each side

        const startIndex = Math.max(0, firstProfitIndex - padding);
        const endIndex = Math.min(chartData.length - 1, lastProfitIndex + padding);

        setZoomRange({ startIndex, endIndex });
      } else if (positions.length > 0) {
        // Fallback to strike-based zoom if no profit zone (e.g., all loss)
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);

        // Tighter buffer for fallback
        const lowerBound = minStrike * 0.9;
        const upperBound = maxStrike * 1.1;

        const startIndex = chartData.findIndex(d => d.price >= lowerBound);
        const endIndex = chartData.findIndex(d => d.price >= upperBound);

        setZoomRange({
          startIndex: startIndex !== -1 ? startIndex : 0,
          endIndex: endIndex !== -1 ? endIndex : chartData.length - 1
        });
      } else {
        setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
      }
    }
    // Note: When only credit changes, we intentionally DON'T reset zoom
    // The user's current zoom level is preserved
  }, [chartData, positions]);

  const xAxisTicks = useMemo(() => {
    if (!chartData.length) return [];

    const start = zoomRange.startIndex;
    const end = zoomRange.endIndex || chartData.length - 1;
    const visibleData = chartData.slice(start, end + 1);

    if (!visibleData.length) return [];

    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const range = maxPrice - minPrice;
    if (range === 0) return [minPrice];

    // Target roughly 8 ticks
    const rawInterval = range / 8;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;

    let interval: number;
    if (normalized < 1.5) interval = 1 * magnitude;
    else if (normalized < 3.5) interval = 2 * magnitude;
    else if (normalized < 7.5) interval = 5 * magnitude;
    else interval = 10 * magnitude;

    const startTick = Math.floor(minPrice / interval) * interval;
    const endTick = Math.ceil(maxPrice / interval) * interval;

    const ticks: number[] = [];
    for (let p = startTick; p <= endTick; p += interval) {
      ticks.push(p);
    }
    return ticks;
  }, [chartData, zoomRange]);

  const handleZoomIn = useCallback(() => {
    setZoomRange(current => {
      const range = current.endIndex - current.startIndex;
      if (range <= 2) return current; // Prevent zooming in too much

      const zoomFactor = Math.floor(range * 0.1) || 1;
      const newStart = Math.min(current.startIndex + zoomFactor, current.endIndex - 2);
      const newEnd = Math.max(current.endIndex - zoomFactor, current.startIndex + 2);

      return { startIndex: newStart, endIndex: newEnd };
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomRange(current => {
      const totalPoints = chartData.length;
      const range = current.endIndex - current.startIndex;

      // If already fully zoomed out, do nothing
      if (current.startIndex === 0 && current.endIndex === totalPoints - 1) return current;

      const zoomFactor = Math.floor(range * 0.1) || 1;
      const newStart = Math.max(0, current.startIndex - zoomFactor);
      const newEnd = Math.min(totalPoints - 1, current.endIndex + zoomFactor);

      return { startIndex: newStart, endIndex: newEnd };
    });
  }, [chartData.length]);

  const handleResetZoom = useCallback(() => {
    if (chartData.length > 0) {
      // Find profit zone indices (same logic as initial load)
      const firstProfitIndex = chartData.findIndex(d => d.pl > 0);
      const lastProfitIndex = chartData.findLastIndex(d => d.pl > 0);

      if (firstProfitIndex !== -1 && lastProfitIndex !== -1) {
        const profitWidth = lastProfitIndex - firstProfitIndex;
        const padding = Math.floor(profitWidth * 0.5);

        const startIndex = Math.max(0, firstProfitIndex - padding);
        const endIndex = Math.min(chartData.length - 1, lastProfitIndex + padding);

        setZoomRange({ startIndex, endIndex });
      } else if (positions.length > 0) {
        // Fallback to strike-based zoom if no profit zone
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);

        const lowerBound = minStrike * 0.9;
        const upperBound = maxStrike * 1.1;

        const startIdx = chartData.findIndex(d => d.price >= lowerBound);
        const endIdx = chartData.findIndex(d => d.price >= upperBound);

        setZoomRange({
          startIndex: startIdx !== -1 ? startIdx : 0,
          endIndex: endIdx !== -1 ? endIdx : chartData.length - 1
        });
      } else {
        setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
      }
    }
  }, [chartData, positions]);

  // Drag-to-pan handlers
  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent native drag/selection behavior
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    // Use functional update to get current zoom range
    setZoomRange(currentRange => {
      dragStartRangeRef.current = { ...currentRange };
      return currentRange;
    });

    // Change cursor to grabbing
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grabbing';
    }
  }, []);

  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX = e.clientX - dragStartXRef.current;
    const chartWidth = rect.width;

    // Calculate how many data points to shift based on drag distance
    const { startIndex: startIdx, endIndex: endIdx } = dragStartRangeRef.current;
    const visibleRange = endIdx - startIdx;

    // Pixels per data point
    const pixelsPerPoint = chartWidth / visibleRange;

    // Calculate shift amount (negative because dragging left should show higher prices)
    const shift = Math.round(-deltaX / pixelsPerPoint);

    setZoomRange(currentRange => {
      const totalPoints = chartData.length;
      let newStart = startIdx + shift;
      let newEnd = endIdx + shift;

      // Clamp to valid range
      if (newStart < 0) {
        newEnd = newEnd - newStart;
        newStart = 0;
      }
      if (newEnd > totalPoints - 1) {
        newStart = newStart - (newEnd - (totalPoints - 1));
        newEnd = totalPoints - 1;
      }

      // Ensure we don't go out of bounds
      newStart = Math.max(0, newStart);
      newEnd = Math.min(totalPoints - 1, newEnd);

      // Only update if changed
      if (newStart !== currentRange.startIndex || newEnd !== currentRange.endIndex) {
        return { startIndex: newStart, endIndex: newEnd };
      }
      return currentRange;
    });
  }, [chartData.length]);

  const handleChartMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    if (chartContainerRef.current) {
      chartContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  return {
    zoomRange,
    setZoomRange,
    chartContainerRef,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleChartMouseDown,
    handleChartMouseMove,
    handleChartMouseUp,
    handleChartMouseLeave,
    xAxisTicks,
  };
}
