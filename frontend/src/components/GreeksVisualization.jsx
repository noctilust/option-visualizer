import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { TrendingUp, Activity } from 'lucide-react';

const GreeksVisualization = ({ chartData, portfolioGreeks, marketData }) => {
    const [selectedGreeks, setSelectedGreeks] = useState({
        delta: true,
        gamma: false,
        theta: false,
        vega: false
    });

    if (!chartData || chartData.length === 0) {
        return null;
    }

    // Greek configurations
    const greekConfig = {
        delta: {
            label: 'Delta',
            color: '#3b82f6',
            description: 'Position delta vs stock price',
            yAxisLabel: 'Delta'
        },
        gamma: {
            label: 'Gamma',
            color: '#8b5cf6',
            description: 'Position gamma vs stock price',
            yAxisLabel: 'Gamma'
        },
        theta: {
            label: 'Theta',
            color: '#ef4444',
            description: 'Daily theta vs stock price',
            yAxisLabel: 'Theta ($/day)'
        },
        vega: {
            label: 'Vega',
            color: '#10b981',
            description: 'Vega vs stock price',
            yAxisLabel: 'Vega (per 1% IV)'
        }
    };

    const toggleGreek = (greek) => {
        setSelectedGreeks(prev => ({
            ...prev,
            [greek]: !prev[greek]
        }));
    };

    // Check if we have Greeks data in chartData
    const hasGreeksData = chartData.some(d =>
        d.delta !== undefined ||
        d.gamma !== undefined ||
        d.theta !== undefined ||
        d.vega !== undefined
    );

    if (!hasGreeksData) {
        return (
            <div className="w-full space-y-4">
                <h3 className="text-lg font-medium">Greeks Visualization</h3>
                <div className="bg-muted/30 border rounded-lg p-6 text-center">
                    <Activity className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                        Enter a stock symbol to enable Greeks visualization
                    </p>
                </div>
            </div>
        );
    }

    // Get current stock price for reference line
    const currentPrice = marketData?.current_price;

    // Count selected Greeks
    const selectedCount = Object.values(selectedGreeks).filter(Boolean).length;

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Greeks vs Stock Price
                </h3>
            </div>

            {/* Greek Selector Buttons */}
            <div className="flex flex-wrap gap-2">
                {Object.entries(greekConfig).map(([key, config]) => (
                    <button
                        key={key}
                        onClick={() => toggleGreek(key)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all font-medium text-sm ${selectedGreeks[key]
                            ? 'border-current shadow-md scale-105'
                            : 'border-border hover:border-current opacity-60 hover:opacity-100'
                            }`}
                        style={{
                            color: selectedGreeks[key] ? config.color : undefined,
                            backgroundColor: selectedGreeks[key] ? `${config.color}15` : undefined
                        }}
                        title={config.description}
                    >
                        {config.label}
                    </button>
                ))}
            </div>

            {selectedCount === 0 && (
                <div className="bg-muted/30 border rounded-lg p-4 text-center text-sm text-muted-foreground">
                    Select at least one Greek to display the chart
                </div>
            )}

            {selectedCount > 0 && (
                <div className="bg-card border rounded-lg p-4">
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis
                                dataKey="price"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(value) => `$${Math.round(value)}`}
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                axisLine={{ stroke: '#525252' }}
                                tickLine={{ stroke: '#525252' }}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                axisLine={{ stroke: '#525252' }}
                                tickLine={{ stroke: '#525252' }}
                                width={40}
                            />
                            <Tooltip
                                cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }}
                                isAnimationActive={false}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-[#262626] border border-[#404040] text-[#e5e5e5] rounded-lg p-3 shadow-lg">
                                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                                    <span className="text-gray-400">Price:</span>
                                                    <span className="text-right font-medium">
                                                        ${Number.isInteger(label) ? label : label.toFixed(2)}
                                                    </span>
                                                    {payload.map((entry, index) => (
                                                        <React.Fragment key={index}>
                                                            <span className="text-gray-400">{entry.name}:</span>
                                                            <span
                                                                className="text-right font-medium"
                                                                style={{ color: entry.color }}
                                                            >
                                                                {entry.value !== null && entry.value !== undefined
                                                                    ? entry.value.toFixed(4)
                                                                    : 'N/A'}
                                                            </span>
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />

                            {/* Current price dotted vertical line */}
                            {currentPrice && (
                                <>
                                    <ReferenceLine
                                        x={currentPrice}
                                        stroke="#10b981"
                                        strokeWidth={1}
                                        strokeDasharray="4 2"
                                        label={{
                                            value: `$${currentPrice.toFixed(2)}`,
                                            position: 'insideBottomLeft',
                                            fill: '#10b981',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            dy: -5
                                        }}
                                    />
                                    {/* Green dot on x-axis */}
                                    <ReferenceDot
                                        x={currentPrice}
                                        y={0}
                                        r={3}
                                        fill="#10b981"
                                        stroke="#fff"
                                        strokeWidth={2}
                                        isFront={true}
                                    />
                                </>
                            )}

                            {/* Render selected Greeks */}
                            {selectedGreeks.delta && (
                                <Line
                                    type="monotone"
                                    dataKey="delta"
                                    stroke={greekConfig.delta.color}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Delta"
                                    connectNulls={true}
                                    isAnimationActive={false}
                                />
                            )}
                            {selectedGreeks.gamma && (
                                <Line
                                    type="monotone"
                                    dataKey="gamma"
                                    stroke={greekConfig.gamma.color}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Gamma"
                                    connectNulls={true}
                                    isAnimationActive={false}
                                />
                            )}
                            {selectedGreeks.theta && (
                                <Line
                                    type="monotone"
                                    dataKey="theta"
                                    stroke={greekConfig.theta.color}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Theta"
                                    connectNulls={true}
                                    isAnimationActive={false}
                                />
                            )}
                            {selectedGreeks.vega && (
                                <Line
                                    type="monotone"
                                    dataKey="vega"
                                    stroke={greekConfig.vega.color}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Vega"
                                    connectNulls={true}
                                    isAnimationActive={false}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>

                    {/* Current price legend */}
                    {currentPrice && (
                        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span className="text-emerald-500 font-semibold">${currentPrice.toFixed(2)}</span>
                            </span>
                            <span className="text-muted-foreground">Current Price</span>
                        </div>
                    )}

                </div>
            )}

            {/* Greeks Summary at Current Price */}
            {portfolioGreeks && currentPrice && (
                <div className="bg-muted/30 border rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-3">Current Position Greeks (at ${currentPrice.toFixed(2)})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {Object.entries(greekConfig).map(([key, config]) => (
                            <div key={key}>
                                <span className="font-medium" style={{ color: config.color }}>
                                    {config.label}:
                                </span>
                                <span className="ml-2 font-mono">
                                    {portfolioGreeks[key]?.toFixed(key === 'gamma' ? 4 : key === 'delta' || key === 'vega' ? 3 : 2) || 'N/A'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Educational Guide */}
            <details className="bg-card border rounded-lg p-4">
                <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                    📈 Understanding Greeks Curves (Click to expand)
                </summary>
                <div className="mt-4 space-y-3 text-sm text-left">
                    <div className="flex">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-16">Delta:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Shows how position delta changes with stock price.<br />
                            Long calls: delta increases as stock rises (approaches 1).<br />
                            Long puts: delta becomes less negative (approaches 0) as stock rises.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 shrink-0 w-16">Gamma:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Shows the rate of delta change.<br />
                            Peaks at-the-money (ATM) for single options.<br />
                            High gamma = delta changes rapidly with small stock moves.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 w-16">Theta:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Shows daily time decay at different stock prices.<br />
                            Most negative (worst) near ATM for long options.<br />
                            Short options have positive theta (earn from time decay).
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-green-600 dark:text-green-400 shrink-0 w-16">Vega:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Shows sensitivity to volatility changes at different prices.<br />
                            Usually highest near ATM.<br />
                            Long options = benefit from IV increase, Short = benefit from IV decrease.
                        </div>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default GreeksVisualization;
