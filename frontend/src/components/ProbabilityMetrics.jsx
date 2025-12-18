import React from 'react';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

const ProbabilityMetrics = ({ probabilityMetrics }) => {
    if (!probabilityMetrics) {
        return null;
    }

    const {
        probability_of_profit,
        max_profit,
        max_loss,
        risk_reward_ratio
    } = probabilityMetrics;

    // Format currency values
    const formatCurrency = (value) => {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';
        const absValue = Math.abs(value);
        const sign = value >= 0 ? '+' : '-';
        return `${sign}$${absValue.toFixed(2)}`;
    };

    // Format percentage
    const formatPercent = (value) => {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';
        return `${value.toFixed(1)}%`;
    };

    // Format ratio
    const formatRatio = (value) => {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';
        return `${value.toFixed(2)}:1`;
    };

    // Get color class based on probability
    const getProbabilityColor = (prob) => {
        if (prob >= 70) return 'text-green-600 dark:text-green-400';
        if (prob >= 50) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    // Get color for profit/loss
    const getProfitLossColor = (value) => {
        return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    };

    return (
        <div className="w-full space-y-4">
            <h3 className="text-lg font-medium">Risk Analysis</h3>

            {/* Main Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Probability of Profit */}
                <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase">
                            Probability of Profit
                        </h4>
                        <Activity className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className={`text-3xl font-bold mb-1 ${getProbabilityColor(probability_of_profit)}`}>
                        {formatPercent(probability_of_profit)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Chance of profit at expiration
                    </p>
                </div>

                {/* Max Profit */}
                <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase">
                            Max Profit
                        </h4>
                        <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className={`text-3xl font-bold mb-1 ${getProfitLossColor(max_profit)}`}>
                        {formatCurrency(max_profit)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Maximum potential profit
                    </p>
                </div>

                {/* Max Loss */}
                <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase">
                            Max Loss
                        </h4>
                        <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className={`text-3xl font-bold mb-1 ${getProfitLossColor(max_loss)}`}>
                        {formatCurrency(max_loss)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Maximum potential loss
                    </p>
                </div>

                {/* Risk/Reward Ratio */}
                <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase">
                            Risk/Reward
                        </h4>
                        <Target className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mb-1 text-foreground">
                        {formatRatio(risk_reward_ratio)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Reward per dollar risked
                    </p>
                </div>
            </div>


            {/* Strategy Assessment */}
            <div className="bg-muted/30 border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-3">Strategy Assessment</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="font-medium">Win Probability:</span>
                        <span className="ml-2">
                            {probability_of_profit >= 70 ? (
                                <span className="text-green-600 dark:text-green-400">High ({formatPercent(probability_of_profit)})</span>
                            ) : probability_of_profit >= 50 ? (
                                <span className="text-yellow-600 dark:text-yellow-400">Moderate ({formatPercent(probability_of_profit)})</span>
                            ) : (
                                <span className="text-red-600 dark:text-red-400">Low ({formatPercent(probability_of_profit)})</span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Profit Potential:</span>
                        <span className="ml-2">
                            {max_profit === Infinity || max_profit > 100000 ? (
                                <span className="text-green-600 dark:text-green-400">Unlimited</span>
                            ) : max_profit > Math.abs(max_loss) * 2 ? (
                                <span className="text-green-600 dark:text-green-400">High ({formatCurrency(max_profit)})</span>
                            ) : (
                                <span className="text-yellow-600 dark:text-yellow-400">Limited ({formatCurrency(max_profit)})</span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Risk Level:</span>
                        <span className="ml-2">
                            {max_loss === -Infinity || max_loss < -100000 ? (
                                <span className="text-red-600 dark:text-red-400">Unlimited</span>
                            ) : Math.abs(max_loss) > 5000 ? (
                                <span className="text-red-600 dark:text-red-400">High ({formatCurrency(max_loss)})</span>
                            ) : Math.abs(max_loss) > 1000 ? (
                                <span className="text-yellow-600 dark:text-yellow-400">Moderate ({formatCurrency(max_loss)})</span>
                            ) : (
                                <span className="text-green-600 dark:text-green-400">Low ({formatCurrency(max_loss)})</span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium">Risk/Reward Assessment:</span>
                        <span className="ml-2">
                            {risk_reward_ratio >= 2 ? (
                                <span className="text-green-600 dark:text-green-400">Favorable ({formatRatio(risk_reward_ratio)})</span>
                            ) : risk_reward_ratio >= 1 ? (
                                <span className="text-yellow-600 dark:text-yellow-400">Balanced ({formatRatio(risk_reward_ratio)})</span>
                            ) : (
                                <span className="text-red-600 dark:text-red-400">Unfavorable ({formatRatio(risk_reward_ratio)})</span>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Educational Guide */}
            <details className="bg-card border rounded-lg p-4">
                <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                    📊 Understanding Risk Metrics (Click to expand)
                </summary>
                <div className="mt-4 space-y-3 text-sm text-left">
                    <div className="flex">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-28">POP:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Probability of Profit - likelihood your position will be profitable at expiration.<br />
                            Based on implied volatility. Higher POP = lower profit potential.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-green-600 dark:text-green-400 shrink-0 w-28">Max Profit:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Maximum earnings if stock moves to most favorable level.<br />
                            "Unlimited" = no cap on potential profit.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 w-28">Max Loss:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Maximum loss if stock moves against you.<br />
                            "Unlimited" = no cap on potential loss (high risk!).
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 shrink-0 w-28">Risk/Reward:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Potential earnings per dollar risked.<br />
                            2:1 ratio = earn $2 for every $1 risked. Higher = better.
                        </div>
                    </div>
                    <div className="flex">
                        <span className="font-semibold text-orange-600 dark:text-orange-400 shrink-0 w-28">Breakeven:</span>
                        <div className="text-muted-foreground leading-relaxed">
                            Stock prices where P/L equals zero at expiration.<br />
                            Stock must move beyond these points for profit.
                        </div>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default ProbabilityMetrics;
