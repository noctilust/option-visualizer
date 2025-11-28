import React, { useState, useEffect, useMemo } from 'react';
import UploadSection from './components/UploadSection';
import InputSection from './components/InputSection';
import PositionsTable from './components/PositionsTable';
import { AreaChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area } from 'recharts';

function App() {
  const [file, setFile] = useState(null);
  const [credit, setCredit] = useState('');
  const [isDebit, setIsDebit] = useState(false);
  const [positions, setPositions] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const xAxisTicks = useMemo(() => {
    if (!chartData.length) return [];
    const prices = chartData.map(d => d.price);
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

    const start = Math.floor(minPrice / interval) * interval;
    const end = Math.ceil(maxPrice / interval) * interval;

    const ticks = [];
    for (let p = start; p <= end; p += interval) {
      ticks.push(p);
    }
    return ticks;
  }, [chartData]);

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setPositions(data.positions);
    } catch (err) {
      console.error(err);
      setError('Failed to upload and parse image. Please try again or enter manually.');
    } finally {
      setLoading(false);
    }
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

        const response = await fetch('http://localhost:8000/calculate', {
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

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <div className="max-w-5xl mx-auto px-4 py-12">
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
            <UploadSection onFileSelect={handleFileSelect} />
            {loading && <p className="text-center text-muted-foreground animate-pulse">Processing image...</p>}
            {error && <p className="text-center text-destructive">{error}</p>}
          </div>

          {positions.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
              <h2 className="text-xl font-semibold mb-4">2. Verify Positions</h2>
              <PositionsTable positions={positions} setPositions={setPositions} />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
            <h2 className="text-xl font-semibold mb-4">3. Enter Amount</h2>
            <InputSection credit={credit} setCredit={setCredit} isDebit={isDebit} setIsDebit={setIsDebit} />
          </div>

          {chartData.length > 0 && (
            <div className="bg-[#1e1e1e] border border-gray-800 rounded-xl shadow-sm p-6 md:p-8 text-gray-200">
              <h2 className="text-xl font-semibold mb-6 text-gray-100">4. Analysis</h2>
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                      dataKey="price"
                      type="number"
                      domain={['auto', 'auto']}
                      ticks={xAxisTicks}
                      allowDecimals={false}
                      stroke="#666"
                      tickFormatter={(value) => `$${Math.round(value)}`}
                      tick={{ fontSize: 12, fill: '#9ca3af', dy: -230 }}
                      axisLine={false}
                      tickLine={false}
                      height={10}
                    />
                    <YAxis
                      stroke="#666"
                      tick={false}
                      width={0}
                      domain={(() => {
                        if (!chartData.length) return ['auto', 'auto'];
                        const max = Math.max(...chartData.map(d => Math.abs(d.pl)));
                        const limit = Math.ceil(max * 1.1); // Add 10% padding
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
                                <span className="text-right font-medium">${Math.round(label)}</span>
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
                    <defs>
                      <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={(() => {
                          const max = Math.max(...chartData.map(d => d.pl));
                          const min = Math.min(...chartData.map(d => d.pl));
                          if (max <= 0) return 0;
                          if (min >= 0) return 1;
                          return max / (max - min);
                        })()} stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset={(() => {
                          const max = Math.max(...chartData.map(d => d.pl));
                          const min = Math.min(...chartData.map(d => d.pl));
                          if (max <= 0) return 0;
                          if (min >= 0) return 1;
                          return max / (max - min);
                        })()} stopColor="#ef4444" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="pl"
                      stroke="url(#splitColor)"
                      fill="url(#splitColor)"
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
