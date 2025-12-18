import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const GreeksChart = ({ portfolioGreeks }) => {
    if (!portfolioGreeks) {
        return null;
    }

    // Greek descriptions
    const greekInfo = {
        delta: {
            label: 'Delta',
            description: 'Change in position value per $1 move in underlying',
            color: '#3b82f6', // blue
        },
        gamma: {
            label: 'Gamma',
            description: 'Rate of change of delta',
            color: '#8b5cf6', // purple
        },
        theta: {
            label: 'Theta',
            description: 'Daily time decay (P/L change per day)',
            color: '#ef4444', // red
        },
        vega: {
            label: 'Vega',
            description: 'Change in position value per 1% IV change',
            color: '#10b981', // green
        },
    };

    // Format values for display
    const formatValue = (value, greek) => {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';

        switch (greek) {
            case 'delta':
                return value.toFixed(2);
            case 'gamma':
                return value.toFixed(4);
            case 'theta':
                return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
            case 'vega':
                return value.toFixed(3);
            default:
                return value.toFixed(3);
        }
    };

    // Get color class for value
    const getValueColorClass = (value, greek) => {
        if (greek === 'theta') {
            // For theta, positive is good (collecting premium)
            return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        } else if (greek === 'delta') {
            // Delta can be positive or negative based on strategy
            return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        }
        return 'text-foreground';
    };

    return (
        <div className="w-full space-y-4">
            <h3 className="text-lg font-medium">Position Greeks</h3>

            {/* Greeks Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(greekInfo).map(([key, info]) => {
                    const value = portfolioGreeks[key];

                    return (
                        <div
                            key={key}
                            className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <h4 className="text-sm font-medium uppercase" style={{ color: info.color }}>
                                    {info.label}
                                </h4>
                            </div>
                            <div className={`text-2xl font-bold mb-1 ${getValueColorClass(value, key)}`}>
                                {formatValue(value, key)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {info.description}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Greeks Interpretation */}
            <div className="bg-muted/30 border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-3">Position Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="font-medium">Directional Bias:</span>
                        <span className="ml-2">
                            {portfolioGreeks.delta > 0.1 ? (
                                <span className="text-green-600 dark:text-green-400">Bullish (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
                            ) : portfolioGreeks.delta < -0.1 ? (
                                <span className="text-red-600 dark:text-red-400">Bearish (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
                            ) : (
                                <span className="text-muted-foreground">Neutral (Delta: {portfolioGreeks.delta.toFixed(2)})</span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Time Decay:</span>
                        <span className="ml-2">
                            {portfolioGreeks.theta > 0 ? (
                                <span className="text-green-600 dark:text-green-400">
                                    Benefiting (+${portfolioGreeks.theta.toFixed(2)}/day)
                                </span>
                            ) : (
                                <span className="text-red-600 dark:text-red-400">
                                    Losing (${portfolioGreeks.theta.toFixed(2)}/day)
                                </span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Volatility Exposure:</span>
                        <span className="ml-2">
                            {Math.abs(portfolioGreeks.vega) > 0.1 ? (
                                portfolioGreeks.vega > 0 ? (
                                    <span className="text-blue-600 dark:text-blue-400">Long Vega (+{portfolioGreeks.vega.toFixed(2)})</span>
                                ) : (
                                    <span className="text-orange-600 dark:text-orange-400">Short Vega ({portfolioGreeks.vega.toFixed(2)})</span>
                                )
                            ) : (
                                <span className="text-muted-foreground">Vega Neutral</span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Gamma Exposure:</span>
                        <span className="ml-2">
                            {portfolioGreeks.gamma > 0 ? (
                                <span className="text-green-600 dark:text-green-400">Positive (Delta increases with price)</span>
                            ) : portfolioGreeks.gamma < 0 ? (
                                <span className="text-red-600 dark:text-red-400">Negative (Delta decreases with price)</span>
                            ) : (
                                <span className="text-muted-foreground">Neutral</span>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Greeks Explanation Guide */}
            <details className="bg-card border rounded-lg p-4">
                <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                    📚 Understanding Greeks (Click to expand)
                </summary>
                <div className="mt-4 space-y-3 text-sm text-left">
                    <div className="flex">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-16">Delta:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            If delta is +50, a $1 increase in stock price increases your position value by $50.<br />
                            Positive = bullish, Negative = bearish, Zero = neutral.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 shrink-0 w-16">Gamma:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            How much delta changes when stock moves $1.<br />
                            High gamma means delta changes rapidly.<br />
                            Long options = positive gamma, Short options = negative gamma.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 w-16">Theta:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Daily profit/loss from time decay.<br />
                            Positive theta = you earn money each day (seller).<br />
                            Negative theta = you lose money each day (buyer).
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-green-600 dark:text-green-400 shrink-0 w-16">Vega:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Change in position value for 1% IV change.<br />
                            Positive vega = benefit from IV increase.<br />
                            Negative vega = benefit from IV decrease.
                        </div>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default GreeksChart;
