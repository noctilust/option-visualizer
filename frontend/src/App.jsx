import React, { useState, useEffect, useMemo } from 'react';
import UploadSection from './components/UploadSection';
import InputSection from './components/InputSection';
import PositionsTable, { generateId } from './components/PositionsTable';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Brush } from 'recharts';
import { Plus, Minus, RotateCcw, Sun, Moon } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [credit, setCredit] = useState('');
  const [isDebit, setIsDebit] = useState(false);
  const [positions, setPositions] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomRange, setZoomRange] = useState({ startIndex: 0, endIndex: 0 });
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'light';
      // If system, check current and go opposite
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'light' : 'dark';
    });
  };

  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Expose mock data loader for testing (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.loadMockData = () => {
        setPositions([
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'P' },
          { id: generateId(), qty: -2, expiration: 'Dec 19', strike: 240, type: 'C' }
        ]);
        setCredit('1750');
        setIsDebit(false);
        console.log('Mock data loaded');
      };
    }
  }, []);

  // Reset zoom when chart data changes, with smart default based on profit zone
  useEffect(() => {
    if (chartData.length > 0) {
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

    let interval;
    if (normalized < 1.5) interval = 1 * magnitude;
    else if (normalized < 3.5) interval = 2 * magnitude; // 2 or 2.5
    else if (normalized < 7.5) interval = 5 * magnitude;
    else interval = 10 * magnitude;

    const startTick = Math.floor(minPrice / interval) * interval;
    const endTick = Math.ceil(maxPrice / interval) * interval;

    const ticks = [];
    for (let p = startTick; p <= endTick; p += interval) {
      ticks.push(p);
    }
    return ticks;
  }, [chartData, zoomRange]);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setPositions(data.positions.map(pos => ({ ...pos, id: generateId() })));
    } catch (err) {
      console.error(err);
      setError('Failed to upload and parse image. Please try again or enter manually.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    setPositions([{ id: generateId(), qty: -1, expiration: '', strike: 0, type: 'P' }]);
  };

  useEffect(() => {
    const calculatePL = async () => {
      if (positions.length === 0 || !credit) {
        setChartData([]);
        return;
      }

      try {
        let creditValue = parseFloat(credit) || 0;
        if (isDebit) {
          creditValue = -creditValue;
        }

        const response = await fetch(`${API_BASE}/calculate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            positions: positions,
            credit: creditValue,
          }),
        });

        if (!response.ok) throw new Error('Calculation failed');

        const data = await response.json();
        setChartData(data.data);
      } catch (err) {
        console.error(err);
        // Don't show error here to avoid spamming while typing
      }
    };

    const timeoutId = setTimeout(() => {
      calculatePL();
    }, 500); // Debounce

    return () => clearTimeout(timeoutId);
  }, [positions, credit, isDebit]);

  const breakevenPoints = useMemo(() => {
    if (!chartData.length) return [];
    const points = [];
    for (let i = 0; i < chartData.length - 1; i++) {
      const p1 = chartData[i];
      const p2 = chartData[i + 1];
      if ((p1.pl >= 0 && p2.pl < 0) || (p1.pl < 0 && p2.pl >= 0)) {
        // Linear interpolation for more accurate x position
        const x = p1.price + (p2.price - p1.price) * ((0 - p1.pl) / (p2.pl - p1.pl));
        points.push({ x, y: 0 });
      }
    }
    return points;
  }, [chartData]);

  const gradientOffset = useMemo(() => {
    const start = zoomRange.startIndex;
    const end = zoomRange.endIndex || chartData.length - 1;
    const visibleData = chartData.slice(start, end + 1);

    if (!visibleData.length) return 0;

    const max = Math.max(...visibleData.map(d => d.pl));
    const min = Math.min(...visibleData.map(d => d.pl));

    if (max <= 0) return 0;
    if (min >= 0) return 1;

    return max / (max - min);
  }, [chartData, zoomRange]);

  const handleStartOver = () => {
    setCredit('');
    setIsDebit(false);
    setPositions([]);
    setChartData([]);
    setError(null);
    setUploadResetKey(prev => prev + 1);
  };

  const handleZoomIn = () => {
    const { startIndex, endIndex } = zoomRange;
    const range = endIndex - startIndex;
    if (range <= 2) return; // Prevent zooming in too much

    const zoomFactor = Math.floor(range * 0.1) || 1; // Zoom in by 10% or at least 1 step
    const newStart = Math.min(startIndex + zoomFactor, endIndex - 2);
    const newEnd = Math.max(endIndex - zoomFactor, startIndex + 2);

    setZoomRange({ startIndex: newStart, endIndex: newEnd });
  };

  const handleZoomOut = () => {
    const { startIndex, endIndex } = zoomRange;
    const totalPoints = chartData.length;
    const range = endIndex - startIndex;

    // If already fully zoomed out, do nothing
    if (startIndex === 0 && endIndex === totalPoints - 1) return;

    const zoomFactor = Math.floor(range * 0.1) || 1; // Zoom out by 10%
    const newStart = Math.max(0, startIndex - zoomFactor);
    const newEnd = Math.min(totalPoints - 1, endIndex + zoomFactor);

    setZoomRange({ startIndex: newStart, endIndex: newEnd });
  };

  const handleResetZoom = () => {
    if (chartData.length > 0) {
      // Find profit zone indices (same logic as initial load)
      const firstProfitIndex = chartData.findIndex(d => d.pl > 0);
      const lastProfitIndex = chartData.findLastIndex(d => d.pl > 0);

      if (firstProfitIndex !== -1 && lastProfitIndex !== -1) {
        const profitWidth = lastProfitIndex - firstProfitIndex;
        const padding = Math.floor(profitWidth * 0.5); // 50% padding on each side

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
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Theme Toggle Button */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full bg-card border border-border hover:bg-muted transition-colors shadow-sm"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun size={20} className="text-yellow-500" />
            ) : (
              <Moon size={20} className="text-slate-700" />
            )}
          </button>
        </div>

        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Option Premium Visualizer
          </h1>
          <p className="text-muted-foreground text-lg">
            Visualize your P/L from option strategies instantly.
          </p>
        </header>

        <main className="space-y-4">
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
            <h2 className="text-xl font-semibold mb-4">1. Upload Positions</h2>
            <UploadSection onFileSelect={handleFileSelect} onManualEntry={handleManualEntry} resetKey={uploadResetKey} />
            {loading && <p className="text-center text-muted-foreground animate-pulse">Processing image...</p>}
            {error && <p className="text-center text-destructive">{error}</p>}
          </div>

          {positions.length > 0 && (
            <>
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-semibold mb-4">2. Verify Positions</h2>
                <PositionsTable positions={positions} setPositions={setPositions} />
              </div>

              <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                <h2 className="text-xl font-semibold mb-4">3. Enter Amount</h2>
                <InputSection credit={credit} setCredit={setCredit} isDebit={isDebit} setIsDebit={setIsDebit} />
              </div>
            </>
          )}

          {chartData.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5 text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">4. Analysis</h2>
                <button
                  onClick={handleStartOver}
                  className="flex items-center justify-center gap-1.5 min-w-[140px] px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
                >
                  <RotateCcw size={14} />
                  Start Over
                </button>
              </div>

              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                      dataKey="price"
                      type="number"
                      domain={['auto', 'auto']}
                      ticks={xAxisTicks}
                      allowDecimals={false}
                      stroke="#666"
                      tickFormatter={(value) => `$${Math.round(value)}`}
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                      axisLine={{ stroke: '#525252' }}
                      tickLine={{ stroke: '#525252' }}
                      tickMargin={8}
                    />
                    <YAxis
                      stroke="#666"
                      tick={false}
                      width={0}
                      domain={(() => {
                        if (!chartData.length) return ['auto', 'auto'];

                        const start = zoomRange.startIndex;
                        const end = zoomRange.endIndex || chartData.length - 1;
                        const visibleData = chartData.slice(start, end + 1);

                        if (!visibleData.length) return ['auto', 'auto'];

                        const maxAbs = Math.max(...visibleData.map(d => Math.abs(d.pl)));
                        const limit = Math.ceil(maxAbs * 1.1); // Add 10% padding

                        // Ensure we don't have a 0 range if everything is 0
                        if (limit === 0) return [-10, 10];

                        return [-limit, limit];
                      })()}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-[#262626] border border-[#404040] text-[#e5e5e5] rounded-lg p-3 shadow-lg">
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <span className="text-gray-400">Price:</span>
                                <span className="text-right font-medium">
                                  ${Number.isInteger(label) ? label : label.toFixed(2)}
                                </span>
                                <span className="text-gray-400">P/L:</span>
                                <span className={`text-right font-medium ${payload[0].value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  ${payload[0].value}
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={0} stroke="#525252" strokeWidth={2} />
                    {breakevenPoints.map((point, index) => (
                      <ReferenceDot
                        key={index}
                        x={point.x}
                        y={point.y}
                        r={6}
                        fill="#10b981"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                    <defs>
                      <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={gradientOffset} stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="pl"
                      stroke="url(#splitColor)"
                      fill="url(#splitColor)"
                      strokeWidth={3}
                    />
                    <Brush
                      dataKey="price"
                      height={25}
                      stroke={isDark ? 'hsl(217.2 32.6% 25%)' : 'hsl(214.3 31.8% 91.4%)'}
                      fill={isDark ? 'hsl(222.2 84% 6%)' : 'hsl(210 40% 98%)'}
                      tickFormatter={(value) => `$${Math.round(value)}`}
                      startIndex={zoomRange.startIndex}
                      endIndex={zoomRange.endIndex}
                      onChange={({ startIndex, endIndex }) => setZoomRange({ startIndex, endIndex })}
                      travellerWidth={10}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={handleZoomIn}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Zoom In"
                >
                  <Plus size={18} />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Zoom Out"
                >
                  <Minus size={18} />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
                  title="Reset Zoom"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
