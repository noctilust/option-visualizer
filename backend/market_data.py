"""
Market Data Fetcher for Options Visualizer

Data Sources:
- Tastytrade API: IV Rank, IV Percentile (requires OAuth credentials)
- Yahoo Finance: Stock prices, historical volatility, risk-free rate
"""

import os
from datetime import date, datetime, timedelta, timezone
from copy import deepcopy
from typing import Any, Optional, Tuple
import logging

import yfinance as yf
import numpy as np

from tastytrade_client import get_tastytrade_client
from shared_cache import (
    CacheTTL,
    SharedCache,
    get_shared_cache,
    seconds_until_next_utc_day,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MarketDataFetcher:
    """Fetches and caches market data from various sources"""

    def __init__(
        self,
        cache_duration_minutes: int = 10,
        shared_cache: SharedCache | None = None,
        tastytrade_client: Any | None = None,
    ):
        """
        Initialize market data fetcher with caching

        Args:
            cache_duration_minutes: How long to cache data (default: 10 minutes)
        """
        self.cache_duration = timedelta(minutes=cache_duration_minutes)
        self._cache = {}
        self._shared_cache = shared_cache or get_shared_cache()

        # Configuration
        self.default_risk_free_rate = float(os.getenv('DEFAULT_RISK_FREE_RATE', '0.045'))
        self.default_iv = float(os.getenv('DEFAULT_IMPLIED_VOLATILITY', '0.25'))
        
        # Initialize Tastytrade client for accurate IV Rank
        self._tastytrade = tastytrade_client or get_tastytrade_client()

    def _is_cache_valid(
        self, cache_key: str, ttl_seconds: float | None = None
    ) -> bool:
        """Check if cached data is still valid"""
        if cache_key not in self._cache:
            return False

        cached_time, _ = self._cache[cache_key]
        duration = (
            timedelta(seconds=ttl_seconds)
            if ttl_seconds is not None
            else self.cache_duration
        )
        return datetime.now() - cached_time < duration

    def _get_from_cache(
        self, cache_key: str, ttl_seconds: float | None = None
    ) -> Optional[Any]:
        """Retrieve data from cache if valid"""
        if self._is_cache_valid(cache_key, ttl_seconds):
            _, data = self._cache[cache_key]
            logger.info("L1 cache hit dataset=%s", cache_key.split("_", 1)[0])
            return deepcopy(data)
        return None

    def _set_cache(self, cache_key: str, data: Any):
        """Store data in cache with timestamp"""
        self._cache[cache_key] = (datetime.now(), deepcopy(data))

    def get_stock_price(self, symbol: str) -> float:
        """
        Fetch current stock price for a symbol from Yahoo Finance.
        
        Note: May have 15-min delay during market hours.
        Tastytrade requires DXLink streaming for real-time quotes (not implemented).

        Args:
            symbol: Stock ticker symbol (e.g., 'AAPL')

        Returns:
            Current stock price

        Raises:
            ValueError: If symbol is invalid or data unavailable
        """
        # Handle index symbols for Yahoo Finance
        normalized_symbol = symbol.strip().upper()
        yahoo_symbol = normalized_symbol
        if normalized_symbol in ['SPX', 'NDX', 'RUT', 'VIX', 'DJX', 'XSP', 'XND']:
            yahoo_symbol = f"^{normalized_symbol}"

        cache_key = f"price_{yahoo_symbol}"
        shared_components = {"symbol": yahoo_symbol}
        cached_price = self._get_from_cache(
            cache_key, CacheTTL.STOCK_PRICE
        )
        if cached_price is not None:
            return cached_price

        shared_price = self._shared_cache.get_json(
            "stock_price", shared_components
        )
        if isinstance(shared_price, (int, float)) and shared_price > 0:
            self._set_cache(cache_key, float(shared_price))
            return float(shared_price)

        lease_owner = self._shared_cache.acquire_fill_lease(
            "stock_price", shared_components
        )
        if not lease_owner:
            shared_price = self._shared_cache.wait_for_json(
                "stock_price", shared_components
            )
            if isinstance(shared_price, (int, float)) and shared_price > 0:
                self._set_cache(cache_key, float(shared_price))
                return float(shared_price)

        try:
            self._shared_cache.record_provider_fetch("stock_price")
            ticker = yf.Ticker(yahoo_symbol)

            # Get current price from fast_info
            try:
                price = ticker.fast_info['last_price']
            except:
                # Fallback to history
                self._shared_cache.record_fallback("stock_price")
                hist = ticker.history(period='1d')
                if hist.empty:
                    raise ValueError(f"No price data available for {symbol}")
                price = hist['Close'].iloc[-1]

            if price is None or price <= 0:
                raise ValueError(f"Invalid price data for {symbol}")

            self._set_cache(cache_key, float(price))
            self._shared_cache.set_json(
                "stock_price",
                shared_components,
                float(price),
                CacheTTL.STOCK_PRICE,
            )
            logger.info(f"Fetched price for {yahoo_symbol}: ${price:.2f}")
            return float(price)

        except Exception as e:
            logger.error(f"Failed to fetch price for {symbol}: {e}")
            raise ValueError(f"Could not fetch stock price for {symbol}. Please verify the symbol or enter price manually.")

    def get_implied_volatility(
        self,
        symbol: str,
        strike: Optional[float] = None,
        expiration_date: Optional[date] = None,
        option_type: str = 'C'
    ) -> float:
        """
        Fetch implied volatility for a symbol.

        Uses Tastytrade IV Index (30-day ATM implied volatility).
        Note: This is ATM IV and may differ from actual per-strike IV due to
        volatility skew/smile. For more accurate pricing, use manual_iv override.

        Args:
            symbol: Stock ticker symbol
            strike: Option strike price (optional, not currently used)
            expiration_date: Option expiration date (optional, not currently used)
            option_type: 'C' for call, 'P' for put (optional, not currently used)

        Returns:
            Implied volatility (annual, as decimal, e.g., 0.25 for 25%)
        """
        normalized_symbol = symbol.strip().upper()
        cache_key = f"iv_{normalized_symbol}"
        shared_components = {"symbol": normalized_symbol}
        cached_iv = self._get_from_cache(
            cache_key, CacheTTL.MARKET_METRICS
        )
        if cached_iv is not None:
            return cached_iv

        shared_iv = self._shared_cache.get_json(
            "implied_volatility", shared_components
        )
        if isinstance(shared_iv, (int, float)) and shared_iv > 0:
            self._set_cache(cache_key, float(shared_iv))
            return float(shared_iv)

        lease_owner = self._shared_cache.acquire_fill_lease(
            "implied_volatility", shared_components
        )
        if not lease_owner:
            shared_iv = self._shared_cache.wait_for_json(
                "implied_volatility", shared_components
            )
            if isinstance(shared_iv, (int, float)) and shared_iv > 0:
                self._set_cache(cache_key, float(shared_iv))
                return float(shared_iv)

        try:
            # Use Tastytrade IV Index (30-day ATM IV)
            if self._tastytrade.is_enabled:
                metrics = self._tastytrade.get_market_metrics(normalized_symbol)
                if metrics and metrics.get('implied_volatility') is not None:
                    iv = metrics['implied_volatility']
                    if iv > 0:
                        logger.info(f"Using Tastytrade IV Index for {symbol}: {iv:.2%}")
                        self._set_cache(cache_key, iv)
                        self._shared_cache.set_json(
                            "implied_volatility",
                            shared_components,
                            iv,
                            CacheTTL.MARKET_METRICS,
                        )
                        return iv

            # Fall back to historical volatility
            self._shared_cache.record_fallback("implied_volatility")
            hv = self.calculate_historical_volatility(
                normalized_symbol, days=20
            )
            if hv is not None:
                logger.info(f"Using historical volatility for {symbol}: {hv:.2%}")
                self._set_cache(cache_key, hv)
                self._shared_cache.set_json(
                    "implied_volatility",
                    shared_components,
                    hv,
                    CacheTTL.MARKET_METRICS,
                )
                return hv

            # Method 4: Use default IV
            logger.warning(f"Could not calculate IV for {symbol}, using default: {self.default_iv:.2%}")
            return self.default_iv

        except Exception as e:
            logger.error(f"Error fetching IV for {symbol}: {e}")
            return self.default_iv

    def calculate_historical_volatility(self, symbol: str, days: int = 20) -> Optional[float]:
        """
        Calculate historical volatility from stock price history

        Args:
            symbol: Stock ticker symbol
            days: Number of days to look back (default: 20)

        Returns:
            Annualized historical volatility (as decimal)
        """
        normalized_symbol = symbol.strip().upper()
        cache_key = f"hv_{normalized_symbol}_{days}"
        shared_components = {
            "symbol": normalized_symbol,
            "days": days,
        }
        cached_hv = self._get_from_cache(
            cache_key, CacheTTL.HISTORICAL_VOLATILITY
        )
        if cached_hv is not None:
            return cached_hv

        shared_hv = self._shared_cache.get_json(
            "historical_volatility", shared_components
        )
        if isinstance(shared_hv, (int, float)) and shared_hv > 0:
            self._set_cache(cache_key, float(shared_hv))
            return float(shared_hv)

        lease_owner = self._shared_cache.acquire_fill_lease(
            "historical_volatility", shared_components
        )
        if not lease_owner:
            shared_hv = self._shared_cache.wait_for_json(
                "historical_volatility", shared_components
            )
            if isinstance(shared_hv, (int, float)) and shared_hv > 0:
                self._set_cache(cache_key, float(shared_hv))
                return float(shared_hv)

        try:
            self._shared_cache.record_provider_fetch(
                "historical_volatility"
            )
            ticker = yf.Ticker(normalized_symbol)

            # Fetch historical data
            hist = ticker.history(period=f"{days + 5}d")  # Extra days for safety

            if hist.empty or len(hist) < days:
                logger.warning(f"Insufficient historical data for {symbol}")
                return None

            # Calculate log returns
            returns = np.log(hist['Close'] / hist['Close'].shift(1))
            returns = returns.dropna()

            if len(returns) < days // 2:
                return None

            # Annualized volatility (assuming 252 trading days)
            volatility = returns.std() * np.sqrt(252)

            if volatility <= 0 or np.isnan(volatility):
                return None

            self._set_cache(cache_key, float(volatility))
            self._shared_cache.set_json(
                "historical_volatility",
                shared_components,
                float(volatility),
                CacheTTL.HISTORICAL_VOLATILITY,
            )
            logger.info(f"Calculated HV for {symbol}: {volatility:.2%}")
            return float(volatility)

        except Exception as e:
            logger.error(f"Error calculating historical volatility for {symbol}: {e}")
            return None

    def calculate_iv_rank(self, symbol: str, current_iv: float) -> Optional[float]:
        """
        Calculate IV Rank for a symbol.
        
        Uses Tastytrade API for accurate IV Rank when credentials are available.
        Falls back to historical volatility-based approximation otherwise.
        
        Args:
            symbol: Stock ticker symbol
            current_iv: Current implied volatility (as decimal) - used for fallback
            
        Returns:
            IV Rank as percentage (0-100), or None if calculation fails
        """
        normalized_symbol = symbol.strip().upper()
        cache_key = f"iv_rank_{normalized_symbol}"
        shared_components = {"symbol": normalized_symbol}
        cached_rank = self._get_from_cache(
            cache_key, CacheTTL.MARKET_METRICS
        )
        if cached_rank is not None:
            return cached_rank

        shared_rank = self._shared_cache.get_json(
            "iv_rank", shared_components
        )
        if isinstance(shared_rank, (int, float)):
            self._set_cache(cache_key, float(shared_rank))
            return float(shared_rank)
        
        # Try Tastytrade first (provides accurate IV Rank)
        if self._tastytrade.is_enabled:
            metrics = self._tastytrade.get_market_metrics(normalized_symbol)
            if metrics and metrics.get('iv_rank') is not None:
                iv_rank = metrics['iv_rank']
                self._set_cache(cache_key, float(iv_rank))
                self._shared_cache.set_json(
                    "iv_rank",
                    shared_components,
                    float(iv_rank),
                    CacheTTL.MARKET_METRICS,
                )
                logger.info(f"Tastytrade IV Rank for {symbol}: {iv_rank:.1f}%")
                return float(iv_rank)
        
        # Fallback: Calculate from historical volatility range
        self._shared_cache.record_fallback("iv_rank")
        return self._calculate_iv_rank_from_hv(normalized_symbol, current_iv)
    
    def _calculate_iv_rank_from_hv(self, symbol: str, current_iv: float) -> Optional[float]:
        """
        Fallback IV Rank calculation using historical volatility range.
        
        Note: This is an approximation since it uses HV instead of actual IV history.
        """
        normalized_symbol = symbol.strip().upper()
        cache_key = f"iv_rank_hv_{normalized_symbol}_{round(current_iv, 6)}"
        
        try:
            ticker = yf.Ticker(normalized_symbol)
            
            # Fetch 1 year of historical data
            hist = ticker.history(period='1y')
            
            if hist.empty or len(hist) < 20:
                logger.warning(f"Insufficient historical data for IV rank: {symbol}")
                return None
            
            # Calculate rolling 20-day historical volatility for each day
            returns = np.log(hist['Close'] / hist['Close'].shift(1))
            rolling_vol = returns.rolling(window=20).std() * np.sqrt(252)
            rolling_vol = rolling_vol.dropna()
            
            if len(rolling_vol) < 10:
                return None
            
            # Get 52-week high and low volatility
            iv_high = rolling_vol.max()
            iv_low = rolling_vol.min()
            
            if iv_high <= iv_low:
                return None
            
            # Calculate IV Rank
            iv_rank = (current_iv - iv_low) / (iv_high - iv_low) * 100
            
            # Clamp between 0 and 100
            iv_rank = max(0, min(100, iv_rank))
            
            self._set_cache(cache_key, float(iv_rank))
            logger.info(f"Calculated HV-based IV Rank for {symbol}: {iv_rank:.1f}% (approximation)")
            return float(iv_rank)
            
        except Exception as e:
            logger.error(f"Error calculating IV rank for {symbol}: {e}")
            return None

    def get_risk_free_rate(self) -> float:
        """
        Get current risk-free rate from 10-year Treasury yield
        
        Fetches live data from Yahoo Finance (^TNX - 10-Year Treasury Note Yield)
        Falls back to default rate if fetching fails.
        Caches the rate until the end of the calendar day.

        Returns:
            Risk-free rate (annual, as decimal, e.g., 0.045 for 4.5%)
        """
        utc_day = datetime.now(timezone.utc).date().isoformat()
        cache_key = f"risk_free_rate_{utc_day}"
        shared_components = {"source": "TNX"}
        
        cached_rate = self._get_from_cache(cache_key, 24 * 60 * 60)
        if cached_rate is not None:
            return cached_rate

        shared_rate = self._shared_cache.get_json(
            "risk_free_rate", shared_components
        )
        if isinstance(shared_rate, (int, float)) and 0 < shared_rate < 0.20:
            self._set_cache(cache_key, float(shared_rate))
            return float(shared_rate)

        lease_owner = self._shared_cache.acquire_fill_lease(
            "risk_free_rate", shared_components
        )
        if not lease_owner:
            shared_rate = self._shared_cache.wait_for_json(
                "risk_free_rate", shared_components
            )
            if (
                isinstance(shared_rate, (int, float))
                and 0 < shared_rate < 0.20
            ):
                self._set_cache(cache_key, float(shared_rate))
                return float(shared_rate)

        try:
            self._shared_cache.record_provider_fetch("risk_free_rate")
            # Fetch 10-year Treasury yield from Yahoo Finance
            # ^TNX is the CBOE 10-Year Treasury Note Yield Index
            treasury = yf.Ticker("^TNX")
            
            # Get current yield
            try:
                # Try fast_info first
                current_yield = treasury.fast_info.get('last_price')
            except:
                current_yield = None
            
            if current_yield is None:
                # Fallback to history
                hist = treasury.history(period='5d')
                if not hist.empty:
                    current_yield = hist['Close'].iloc[-1]
            
            if current_yield is not None and current_yield > 0:
                # ^TNX returns yield as percentage (e.g., 4.5 for 4.5%)
                # Convert to decimal
                rate = float(current_yield) / 100.0
                
                # Sanity check: rate should be between 0% and 20%
                if 0 < rate < 0.20:
                    self._set_cache(cache_key, rate)
                    self._shared_cache.set_json(
                        "risk_free_rate",
                        shared_components,
                        rate,
                        seconds_until_next_utc_day(),
                    )
                    logger.info(f"Fetched live risk-free rate (10Y Treasury): {rate:.2%} - cached until end of day")
                    return rate
                else:
                    logger.warning(f"Risk-free rate out of range: {rate}, using default")
            
        except Exception as e:
            logger.warning(f"Failed to fetch live risk-free rate: {e}")
        
        # Fallback to default
        rate = self.default_risk_free_rate
        self._shared_cache.record_fallback("risk_free_rate")
        logger.info(f"Using default risk-free rate: {rate:.2%}")
        return rate

    def parse_expiration_date(
        self,
        expiration_str: str,
        reference_date: Optional[date] = None
    ) -> date:
        """
        Parse expiration date string to date object

        Handles formats:
        - "Jan 16" (assumes nearest future date)
        - "2025-01-16" (ISO format)
        - "1/16/2025" (US format)
        - "01/16/25" (US format short year)

        Args:
            expiration_str: Expiration date string
            reference_date: Reference date for "Jan 16" format (default: today)

        Returns:
            date object

        Raises:
            ValueError: If format is not recognized
        """
        if reference_date is None:
            reference_date = date.today()

        expiration_str = expiration_str.strip()

        # Try ISO format (YYYY-MM-DD)
        try:
            return datetime.strptime(expiration_str, '%Y-%m-%d').date()
        except ValueError:
            pass

        # Try US format with full year (M/D/YYYY or MM/DD/YYYY)
        try:
            return datetime.strptime(expiration_str, '%m/%d/%Y').date()
        except ValueError:
            pass

        # Try US format with short year (M/D/YY or MM/DD/YY)
        try:
            return datetime.strptime(expiration_str, '%m/%d/%y').date()
        except ValueError:
            pass

        # Try "Jan 17 26" format (month day short-year)
        try:
            parsed = datetime.strptime(expiration_str, '%b %d %y')
            return parsed.date()
        except ValueError:
            pass

        # Try "Jan 16" format (assumes current or next year)
        try:
            # Parse month and day
            parsed = datetime.strptime(expiration_str, '%b %d')

            # Assume current year first
            exp_date = parsed.replace(year=reference_date.year).date()

            # If the date is in the past by more than 30 days, assume next year
            # Otherwise, treat as expired (options typically expire within same year cycle)
            days_diff = (reference_date - exp_date).days
            if days_diff > 30:
                exp_date = parsed.replace(year=reference_date.year + 1).date()

            return exp_date
        except ValueError:
            pass

        # If all parsing attempts fail
        raise ValueError(
            f"Could not parse expiration date: '{expiration_str}'. "
            f"Supported formats: 'Jan 17 26', 'Jan 16', '2025-01-16', '1/16/2025', '01/16/25'"
        )


def calculate_days_to_expiration(
    expiration_str: str,
    current_date: Optional[date] = None,
    fetcher: Optional[MarketDataFetcher] = None
) -> int:
    """
    Calculate days to expiration from expiration string

    Args:
        expiration_str: Expiration date string
        current_date: Current date (default: today)
        fetcher: MarketDataFetcher instance (optional, creates new if not provided)

    Returns:
        Days until expiration (0 if expired)
    """
    if current_date is None:
        current_date = date.today()

    if fetcher is None:
        fetcher = MarketDataFetcher()

    exp_date = fetcher.parse_expiration_date(expiration_str, current_date)
    dte = (exp_date - current_date).days

    # Return 0 for expired options (negative DTE)
    return max(0, dte)
