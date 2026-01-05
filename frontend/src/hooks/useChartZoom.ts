import { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue, type RefObject } from 'react';
import type { ZoomRange, ChartDataPoint, Position } from '../types';

interface UseChartZoomProps {
  chartData: ChartDataPoint[];
  positions: Position[];
}

interface UseChartZoomReturn {
  zoomRange: ZoomRange;
  deferredZoomRange: ZoomRange; // Deferred version for smoother rendering
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

  // Deferred zoom range for smoother rendering during rapid updates (dragging/zooming)
  const deferredZoomRange = useDeferredValue(zoomRange);

  // Drag-to-pan state
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<ZoomRange>({ startIndex: 0, endIndex: 0 });

  // Track positions fingerprint to only reset zoom when strategy fundamentally changes
  const positionsFingerprintRef = useRef<string>('');
  const hasInitializedRef = useRef(false);

  // Reset zoom when chart data changes, with smart default based on breakeven points
  useEffect(() => {
    if (chartData.length === 0 || positions.length === 0) return;

    // Find breakeven points from chart data (where P/L crosses zero)
    const breakevenPrices: number[] = [];
    for (let i = 0; i < chartData.length - 1; i++) {
      const p1 = chartData[i];
      const p2 = chartData[i + 1];
      if ((p1.pl >= 0 && p2.pl < 0) || (p1.pl < 0 && p2.pl >= 0)) {
        const bePrice = p1.price + (p2.price - p1.price) * ((0 - p1.pl) / (p2.pl - p1.pl));
        breakevenPrices.push(Math.round(bePrice * 100) / 100); // Round to 2 decimals
      }
    }

    // Generate fingerprint including breakeven points (changes when credit changes)
    const positionsKey = positions.map(p => `${p.strike}-${p.type}-${p.qty}`).sort().join('|');
    const breakevenKey = breakevenPrices.sort((a, b) => a - b).join(',');
    const newFingerprint = `${positionsKey}::${breakevenKey}`;

    const shouldRecalculate = !hasInitializedRef.current || newFingerprint !== positionsFingerprintRef.current;

    if (shouldRecalculate) {
      positionsFingerprintRef.current = newFingerprint;
      hasInitializedRef.current = true;

      let lowerBound: number;
      let upperBound: number;

      if (breakevenPrices.length >= 2) {
        // Profit zone takes ~70% of chart (21.5% padding each side)
        const minBE = Math.min(...breakevenPrices);
        const maxBE = Math.max(...breakevenPrices);
        const beSpread = maxBE - minBE;
        const padding = beSpread * 0.215;
        lowerBound = minBE - padding;
        upperBound = maxBE + padding;
      } else {
        // Fallback to strike-based calculation
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);
        const strikeSpread = maxStrike - minStrike;
        const centerPrice = (minStrike + maxStrike) / 2;
        const effectiveSpread = strikeSpread > 0 ? strikeSpread : minStrike * 0.15;
        const viewRadius = effectiveSpread * 0.7;
        lowerBound = centerPrice - viewRadius;
        upperBound = centerPrice + viewRadius;
      }

      const startIndex = chartData.findIndex(d => d.price >= lowerBound);
      const endIndex = chartData.findIndex(d => d.price >= upperBound);

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZoomRange({
        startIndex: startIndex !== -1 ? startIndex : 0,
        endIndex: endIndex !== -1 ? endIndex : chartData.length - 1
      });
    }
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
    if (chartData.length > 0 && positions.length > 0) {
      // Find breakeven points from chart data (where P/L crosses zero)
      const breakevenPrices: number[] = [];
      for (let i = 0; i < chartData.length - 1; i++) {
        const p1 = chartData[i];
        const p2 = chartData[i + 1];
        if ((p1.pl >= 0 && p2.pl < 0) || (p1.pl < 0 && p2.pl >= 0)) {
          const bePrice = p1.price + (p2.price - p1.price) * ((0 - p1.pl) / (p2.pl - p1.pl));
          breakevenPrices.push(bePrice);
        }
      }

      let lowerBound: number;
      let upperBound: number;

      if (breakevenPrices.length >= 2) {
        // Profit zone takes ~70% of chart (21.5% padding each side)
        const minBE = Math.min(...breakevenPrices);
        const maxBE = Math.max(...breakevenPrices);
        const beSpread = maxBE - minBE;
        const padding = beSpread * 0.215;
        lowerBound = minBE - padding;
        upperBound = maxBE + padding;
      } else {
        // Fallback to strike-based calculation
        const strikes = positions.map(p => p.strike);
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);
        const strikeSpread = maxStrike - minStrike;
        const centerPrice = (minStrike + maxStrike) / 2;
        const effectiveSpread = strikeSpread > 0 ? strikeSpread : minStrike * 0.15;
        const viewRadius = effectiveSpread * 0.7;
        lowerBound = centerPrice - viewRadius;
        upperBound = centerPrice + viewRadius;
      }

      const startIdx = chartData.findIndex(d => d.price >= lowerBound);
      const endIdx = chartData.findIndex(d => d.price >= upperBound);

      setZoomRange({
        startIndex: startIdx !== -1 ? startIdx : 0,
        endIndex: endIdx !== -1 ? endIdx : chartData.length - 1
      });
    } else if (chartData.length > 0) {
      setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
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
    deferredZoomRange,
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
