from pydantic import BaseModel, Field, field_validator, ValidationInfo
from typing import List, Literal, Optional, Dict
from datetime import datetime

class Position(BaseModel):
    qty: int = Field(..., description="Quantity (positive for long, negative for short)")
    expiration: str = Field(default="N/A", description="Expiration date (e.g., 'Jan 16') - optional for P/L calculation")
    strike: float = Field(..., gt=0, description="Strike price (must be positive)")
    type: Literal["C", "P"] = Field(..., description="Option type: 'C' for Call, 'P' for Put")
    style: Literal["European", "American"] = Field(default="American", description="Option style: 'European' (exercise at expiration) or 'American' (early exercise)")
    symbol: Optional[str] = Field(None, description="Stock symbol (e.g., 'AAPL') - required for Black-Scholes pricing")
    manual_price: Optional[float] = Field(None, description="Manual override for stock price")
    manual_iv: Optional[float] = Field(None, description="Manual override for implied volatility (as decimal, e.g., 0.25)")
    dividend_yield: Optional[float] = Field(None, description="Dividend yield (annual, as decimal, e.g., 0.02 for 2%)")

    @field_validator('qty')
    @classmethod
    def qty_not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError('Quantity cannot be zero')
        return v

    @field_validator('style', mode='before')
    @classmethod
    def set_index_style(cls, v: str, info: ValidationInfo) -> str:
        symbol = info.data.get('symbol', '')
        index_symbols = {'SPX', 'NDX', 'RUT', 'VIX', 'DJX', 'XSP', 'XND'}
        if symbol and symbol.upper() in index_symbols:
            return 'European'
        return v or 'American'

class Greeks(BaseModel):
    """Option Greeks"""
    delta: float = Field(..., description="Delta: sensitivity to stock price change")
    gamma: float = Field(..., description="Gamma: rate of change of delta")
    theta: float = Field(..., description="Theta: time decay (per day)")
    vega: float = Field(..., description="Vega: sensitivity to volatility change")
    rho: float = Field(..., description="Rho: sensitivity to interest rate change")

class PositionWithGreeks(BaseModel):
    """Position with calculated Greeks and values"""
    position: Dict = Field(..., description="Original position data")
    greeks: Greeks = Field(..., description="Option Greeks for this position")
    theoretical_value: float = Field(..., description="Current Black-Scholes theoretical value per share")
    intrinsic_value: float = Field(..., description="Intrinsic value at expiration per share")

class MarketData(BaseModel):
    """Market data for an underlying symbol"""
    symbol: str = Field(..., description="Stock ticker symbol")
    current_price: float = Field(..., description="Current stock price")
    implied_volatility: float = Field(..., description="Implied volatility (as decimal)")
    risk_free_rate: float = Field(..., description="Risk-free rate (as decimal)")
    dividend_yield: float = Field(0.0, description="Dividend yield (annual, as decimal)")
    iv_rank: Optional[float] = Field(None, description="IV Rank (0-100)")
    iv_percentile: Optional[float] = Field(None, description="IV Percentile (0-100)")
    historical_volatility: Optional[float] = Field(None, description="20-day historical volatility (as decimal)")
    earnings_date: Optional[str] = Field(None, description="Next earnings date (YYYY-MM-DD)")
    timestamp: datetime = Field(..., description="When the data was fetched")

class CalculateRequest(BaseModel):
    positions: List[Position] = Field(..., min_length=1, description="List of option positions")
    credit: float = Field(..., description="Net credit/debit received")
    symbol: Optional[str] = Field(None, description="Stock symbol for Black-Scholes pricing (optional for backward compatibility)")
    use_theoretical_pricing: bool = Field(True, description="Use Black-Scholes theoretical pricing (default: True)")
    current_date: Optional[str] = Field(None, description="Current date for DTE calculation (ISO format: YYYY-MM-DD, default: today)")
    skip_greeks_curve: bool = Field(False, description="Skip Greeks curve calculation for faster P/L-only response")
    eval_days_from_now: Optional[int] = Field(None, description="Days from now to evaluate P/L at (0 = today, None = show current theoretical only)")
    precompute_dates: bool = Field(False, description="Pre-compute P/L curves for multiple dates (speeds up date slider)")
    iv_shift: float = Field(0.0, ge=-0.9, le=3.0, description="Relative IV change for pre-expiration P/L curves (-0.3 = IV down 30%)")
    profit_target_pct: float = Field(50.0, gt=0, le=100, description="Profit target as % of max profit")

class ShortStrikeRisk(BaseModel):
    strike: float
    type: Literal["C", "P"]
    probability_itm: float = Field(..., description="Probability of expiring in the money (%)")
    probability_of_touch: float = Field(..., description="Approximate probability of touching the strike before expiration (%)")

class ProbabilityMetrics(BaseModel):
    """Probability and risk metrics for the strategy"""
    probability_of_profit: Optional[float] = Field(None, description="Probability of profit at expiration (%)")
    max_profit: Optional[float] = Field(None, description="Maximum possible profit (None = unlimited)")
    max_loss: Optional[float] = Field(None, description="Maximum possible loss as negative P/L (None = unlimited)")
    breakeven_points: List[float] = Field(..., description="Breakeven stock prices")
    risk_reward_ratio: Optional[float] = Field(None, description="Risk/reward ratio (max_profit / abs(max_loss))")
    probability_of_profit_target: Optional[float] = Field(None, description="Probability of reaching the profit target before expiration (%)")
    profit_target_pct: float = Field(50.0, description="Profit target used (% of max profit)")
    short_strikes: List[ShortStrikeRisk] = Field(default_factory=list)

class ExpectedMove(BaseModel):
    amount: float
    lower: float
    upper: float
    days: int

class MarketCredit(BaseModel):
    mid: float = Field(..., description="Net credit at mid prices (negative = debit)")
    natural: float = Field(..., description="Net credit at natural prices (sell bid / buy ask)")
    bid_ask_width: float = Field(..., description="Total bid/ask width in dollars")
    spread_pct: Optional[float] = Field(None, description="Bid/ask width as % of mid credit")

class SellerMetrics(BaseModel):
    buying_power: Optional[float] = Field(None, description="Estimated buying power reduction")
    buying_power_method: Optional[Literal["defined_risk", "reg_t_naked"]] = None
    return_on_capital: Optional[float] = Field(None, description="Max profit / buying power (decimal)")
    annualized_return: Optional[float] = Field(None, description="Return on capital annualized to nearest expiration (decimal)")
    theta_per_day: Optional[float] = Field(None, description="Portfolio theta in dollars per day")
    theta_to_buying_power: Optional[float] = Field(None, description="Daily theta / buying power (decimal)")
    expected_move: Optional[ExpectedMove] = None
    market_credit: Optional[MarketCredit] = None
    days_to_expiration: Optional[int] = None
    earnings_date: Optional[str] = None
    earnings_before_expiration: bool = False

class ScenarioLeg(BaseModel):
    """Per-position pricing inputs for client-side IV scenario previews"""
    iv: float = Field(..., description="Unshifted IV used for this position (as decimal)")
    dte: int = Field(..., description="Calendar days to expiration from today")
    dividend_yield: float = Field(0.0, description="Dividend yield used (as decimal)")

class CalculateResponse(BaseModel):
    """Response from calculate endpoint with Greeks"""
    data: List[Dict[str, float]] = Field(..., description="P/L data points: [{price, pl, theoretical_pl, pl_at_date?}, ...]")
    positions_with_greeks: Optional[List[PositionWithGreeks]] = Field(None, description="Greeks for each position")
    portfolio_greeks: Optional[Greeks] = Field(None, description="Portfolio-level Greeks")
    market_data: Optional[MarketData] = Field(None, description="Market data used for calculation")
    probability_metrics: Optional[ProbabilityMetrics] = Field(None, description="Probability of profit and risk metrics")
    seller_metrics: Optional[SellerMetrics] = Field(None, description="Buying power, return on capital, expected move and quotes")
    iv_shift: float = Field(0.0, description="IV shift applied to pre-expiration curves")
    scenario_legs: Optional[List[ScenarioLeg]] = Field(None, description="Per-position inputs aligned with the request positions")
    eval_days_from_now: Optional[int] = Field(None, description="Days from now that was used for pl_at_date calculation")
    max_days_to_expiration: Optional[int] = Field(None, description="Maximum days to expiration across all positions")
    precomputed_dates: Optional[Dict[int, List[float]]] = Field(None, description="Pre-computed P/L values at different days: {days: [pl_values...]}")
