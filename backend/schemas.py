from pydantic import BaseModel, Field, field_validator
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
    timestamp: datetime = Field(..., description="When the data was fetched")

class CalculateRequest(BaseModel):
    positions: List[Position] = Field(..., min_length=1, description="List of option positions")
    credit: float = Field(..., description="Net credit/debit received")
    symbol: Optional[str] = Field(None, description="Stock symbol for Black-Scholes pricing (optional for backward compatibility)")
    use_theoretical_pricing: bool = Field(True, description="Use Black-Scholes theoretical pricing (default: True)")
    current_date: Optional[str] = Field(None, description="Current date for DTE calculation (ISO format: YYYY-MM-DD, default: today)")
    skip_greeks_curve: bool = Field(False, description="Skip Greeks curve calculation for faster P/L-only response")

class ProbabilityMetrics(BaseModel):
    """Probability and risk metrics for the strategy"""
    probability_of_profit: float = Field(..., description="Probability of profit at expiration (%)")
    max_profit: float = Field(..., description="Maximum possible profit")
    max_loss: float = Field(..., description="Maximum possible loss")
    breakeven_points: List[float] = Field(..., description="Breakeven stock prices")
    risk_reward_ratio: Optional[float] = Field(None, description="Risk/reward ratio (max_profit / abs(max_loss))")

class CalculateResponse(BaseModel):
    """Response from calculate endpoint with Greeks"""
    data: List[Dict[str, float]] = Field(..., description="P/L data points: [{price, pl, theoretical_pl}, ...]")
    positions_with_greeks: Optional[List[PositionWithGreeks]] = Field(None, description="Greeks for each position")
    portfolio_greeks: Optional[Greeks] = Field(None, description="Portfolio-level Greeks")
    market_data: Optional[MarketData] = Field(None, description="Market data used for calculation")
    probability_metrics: Optional[Dict] = Field(None, description="Probability of profit and risk metrics")
