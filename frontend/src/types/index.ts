// Shared type definitions for the option visualizer

export interface Position {
  id: string;
  qty: number;
  expiration: string;
  strike: number;
  type: 'C' | 'P';
  style?: 'American' | 'European';
}

export interface MarketData {
  symbol: string;
  current_price: number;
  implied_volatility: number;
  iv_rank: number | null;
  iv_percentile?: number | null;
  historical_volatility?: number | null;
  dividend_yield?: number;
  earnings_date?: string | null;
  risk_free_rate: number;
  timestamp?: string;
}

export interface ChartDataPoint {
  price: number;
  pl: number;
  theoretical_pl?: number;
  pl_at_date?: number;  // P/L at a specific future date (not expiration)
  profit?: number;
  loss?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface PortfolioGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface PositionWithGreeks {
  position: Position;
  greeks: PortfolioGreeks;
  theoretical_value: number;
  intrinsic_value: number;
}

export interface ZoomRange {
  startIndex: number;
  endIndex: number;
}

export interface BreakevenPoint {
  x: number;
  y: number;
}

export interface ShortStrikeRisk {
  strike: number;
  type: 'C' | 'P';
  probability_itm: number;       // %
  probability_of_touch: number;  // %
}

export interface ProbabilityMetrics {
  probability_of_profit: number | null;  // % at expiration; null without market data
  max_profit: number | null;             // null = unlimited
  max_loss: number | null;               // negative P/L; null = unlimited
  breakeven_points: number[];
  risk_reward_ratio: number | null;
  probability_of_profit_target: number | null;  // % chance of hitting the profit target before expiration
  profit_target_pct: number;
  short_strikes: ShortStrikeRisk[];
}

export interface ExpectedMove {
  amount: number;
  lower: number;
  upper: number;
  days: number;
}

export interface MarketCredit {
  mid: number;        // negative = debit
  natural: number;
  bid_ask_width: number;
  spread_pct: number | null;
}

export interface SellerMetrics {
  buying_power: number | null;
  buying_power_method: 'defined_risk' | 'reg_t_naked' | null;
  return_on_capital: number | null;    // decimal
  annualized_return: number | null;    // decimal
  theta_per_day: number | null;        // dollars
  theta_to_buying_power: number | null; // decimal
  expected_move: ExpectedMove | null;
  market_credit: MarketCredit | null;
  days_to_expiration: number | null;
  earnings_date: string | null;
  earnings_before_expiration: boolean;
}

export interface ManagementSettings {
  profitTargetPct: number;  // % of max profit
  stopMultiple: number;     // stop when loss reaches N x credit
  managementDte: number;    // close/roll at this many days to expiration
}

/** Unshifted pricing inputs for one position, aligned with the request positions */
export interface ScenarioLeg {
  iv: number;
  dte: number;
  dividend_yield: number;
}

/** What the current curves were priced with, for client-side IV previews */
export interface IvScenarioBase {
  positions: Position[];
  legs: ScenarioLeg[];
  ivShiftPct: number;
  riskFreeRate: number;
}

// API Response types
export interface CalculateResponse {
  data: ChartDataPoint[];
  positions_with_greeks: PositionWithGreeks[] | null;
  portfolio_greeks: PortfolioGreeks | null;
  market_data: MarketData | null;
  probability_metrics: ProbabilityMetrics | null;
  seller_metrics?: SellerMetrics | null;
  iv_shift?: number;
  scenario_legs?: ScenarioLeg[] | null;
  eval_days_from_now: number | null;        // Days from now used for pl_at_date
  max_days_to_expiration: number | null;    // Max DTE for slider range
  precomputed_dates: Record<number, number[]> | null;  // Pre-computed P/L curves at different dates
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: 'STOCK' | 'ETF' | 'INDEX';
}

export interface SymbolSearchResponse {
  results: SymbolSearchResult[];
}

// Theme type
export type Theme = 'light' | 'dark' | 'system';

// Volatility Skew types
export interface SkewDataPoint {
  strike: number;
  call_iv: number | null;     // null if no data
  put_iv: number | null;
  call_delta?: number;
  put_delta?: number;
  call_bid?: number;
  call_ask?: number;
  put_bid?: number;
  put_ask?: number;
}

export interface SkewLegSelection {
  strike: number;
  delta: number | null;
  iv: number;
}

export type SkewBasis = '25_delta' | 'atm' | 'unavailable';
export type SkewDataStatus = 'ok' | 'no_quotes' | 'provider_error';

export interface SkewData {
  symbol: string;
  expiration: string;
  current_price: number;
  atm_iv: number;              // IV at nearest strike
  skew_metric: number | null;  // Put IV minus Call IV
  skew_basis?: SkewBasis;      // Optional for compatibility with older API responses
  data_status?: SkewDataStatus;
  call_selection?: SkewLegSelection | null;
  put_selection?: SkewLegSelection | null;
  points: SkewDataPoint[];
}

export interface SkewResponse {
  data: SkewData | null;
  error?: string;
}
