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

export interface ProbabilityMetrics {
  probability_of_profit: number;
  max_profit: number;
  max_loss: number;
  breakeven_points: number[];
  risk_reward_ratio: number | null;
}

// API Response types
export interface CalculateResponse {
  data: ChartDataPoint[];
  positions_with_greeks: PositionWithGreeks[] | null;
  portfolio_greeks: PortfolioGreeks | null;
  market_data: MarketData | null;
  probability_metrics: ProbabilityMetrics | null;
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
