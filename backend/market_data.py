"""
Market Data Fetcher for Options Visualizer

Data Sources:
- Tastytrade API: IV Rank, IV Percentile (requires OAuth credentials)
- Yahoo Finance: Stock prices, historical volatility, risk-free rate
"""

import os
from datetime import date, datetime, timedelta
from typing import Optional, Tuple
import logging

import yfinance as yf
import numpy as np

from tastytrade_client import get_tastytrade_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MarketDataFetcher:
    """Fetches and caches market data from various sources"""

    def __init__(self, cache_duration_minutes: int = 10):
        """
        Initialize market data fetcher with caching

        Args:
            cache_duration_minutes: How long to cache data (default: 10 minutes)
        """
        self.cache_duration = timedelta(minutes=cache_duration_minutes)
        self._cache = {}

        # Configuration
        self.default_risk_free_rate = float(os.getenv('DEFAULT_RISK_FREE_RATE', '0.045'))
        self.default_iv = float(os.getenv('DEFAULT_IMPLIED_VOLATILITY', '0.25'))
        
        # Initialize Tastytrade client for accurate IV Rank
        self._tastytrade = get_tastytrade_client()

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid"""
        if cache_key not in self._cache:
            return False

        cached_time, _ = self._cache[cache_key]
        return datetime.now() - cached_time < self.cache_duration

    def _is_daily_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid for the current calendar day"""
        if cache_key not in self._cache:
            return False

        cached_time, _ = self._cache[cache_key]
        # Valid if cached time is from same calendar day
        return cached_time.date() == datetime.now().date()

    def _get_from_cache(self, cache_key: str) -> Optional[any]:
        """Retrieve data from cache if valid"""
        if self._is_cache_valid(cache_key):
            _, data = self._cache[cache_key]
            logger.info(f"Cache hit for {cache_key}")
            return data
        return None

    def _set_cache(self, cache_key: str, data: any):
        """Store data in cache with timestamp"""
        self._cache[cache_key] = (datetime.now(), data)
        logger.info(f"Cached data for {cache_key}")

    def get_stock_price(self, symbol: str) -> float:
        """
        Fetch current stock price for a symbol

        Args:
            symbol: Stock ticker symbol (e.g., 'AAPL')

        Returns:
            Current stock price

        Raises:
            ValueError: If symbol is invalid or data unavailable
        """
        cache_key = f"price_{symbol}"
        cached_price = self._get_from_cache(cache_key)
        if cached_price is not None:
            return cached_price

        try:
            # Fetch from Yahoo Finance
            ticker = yf.Ticker(symbol)

            # Get current price from fast_info
            try:
                price = ticker.fast_info['last_price']
            except:
                # Fallback to history
                hist = ticker.history(period='1d')
                if hist.empty:
                    raise ValueError(f"No price data available for {symbol}")
                price = hist['Close'].iloc[-1]

            if price is None or price <= 0:
                raise ValueError(f"Invalid price data for {symbol}")

            self._set_cache(cache_key, float(price))
            logger.info(f"Fetched price for {symbol}: ${price:.2f}")
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
        Fetch implied volatility for an option

        First attempts to get IV from options chain (strike-specific).
        Falls back to historical volatility if options chain unavailable.

        Args:
            symbol: Stock ticker symbol
            strike: Option strike price (optional)
            expiration_date: Option expiration date (optional)
            option_type: 'C' for call, 'P' for put

        Returns:
            Implied volatility (annual, as decimal, e.g., 0.25 for 25%)
        """
        cache_key = f"iv_{symbol}_{strike}_{expiration_date}_{option_type}"
        cached_iv = self._get_from_cache(cache_key)
        if cached_iv is not None:
            return cached_iv

        try:
            # Method 1: Try to get IV from options chain
            if strike is not None and expiration_date is not None:
                iv = self._get_iv_from_options_chain(symbol, strike, expiration_date, option_type)
                if iv is not None:
                    self._set_cache(cache_key, iv)
                    return iv

            # Method 2: Fall back to historical volatility
            hv = self.calculate_historical_volatility(symbol, days=20)
            if hv is not None:
                logger.info(f"Using historical volatility for {symbol}: {hv:.2%}")
                self._set_cache(cache_key, hv)
                return hv

            # Method 3: Use default IV
            logger.warning(f"Could not calculate IV for {symbol}, using default: {self.default_iv:.2%}")
            return self.default_iv

        except Exception as e:
            logger.error(f"Error fetching IV for {symbol}: {e}")
            return self.default_iv

    def _get_iv_from_options_chain(
        self,
        symbol: str,
        strike: float,
        expiration_date: date,
        option_type: str
    ) -> Optional[float]:
        """
        Attempt to fetch IV from options chain

        Returns:
            IV if found, None otherwise
        """
        try:
            ticker = yf.Ticker(symbol)

            # Format expiration date
            exp_str = expiration_date.strftime('%Y-%m-%d')

            # Get options chain
            options_chain = ticker.option_chain(exp_str)

            # Select calls or puts
            if option_type.upper() == 'C':
                chain = options_chain.calls
            else:
                chain = options_chain.puts

            # Find the closest strike
            if not chain.empty:
                chain['strike_diff'] = abs(chain['strike'] - strike)
                closest = chain.loc[chain['strike_diff'].idxmin()]

                # Get implied volatility
                if 'impliedVolatility' in closest and not np.isnan(closest['impliedVolatility']):
                    iv = float(closest['impliedVolatility'])
                    logger.info(f"Found IV from options chain: {iv:.2%}")
                    return iv

            return None

        except Exception as e:
            logger.debug(f"Could not fetch IV from options chain: {e}")
            return None

    def calculate_historical_volatility(self, symbol: str, days: int = 20) -> Optional[float]:
        """
        Calculate historical volatility from stock price history

        Args:
            symbol: Stock ticker symbol
            days: Number of days to look back (default: 20)

        Returns:
            Annualized historical volatility (as decimal)
        """
        cache_key = f"hv_{symbol}_{days}"
        cached_hv = self._get_from_cache(cache_key)
        if cached_hv is not None:
            return cached_hv

        try:
            ticker = yf.Ticker(symbol)

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
        cache_key = f"iv_rank_{symbol}"
        cached_rank = self._get_from_cache(cache_key)
        if cached_rank is not None:
            return cached_rank
        
        # Try Tastytrade first (provides accurate IV Rank)
        if self._tastytrade.is_enabled:
            metrics = self._tastytrade.get_market_metrics(symbol)
            if metrics and metrics.get('iv_rank') is not None:
                iv_rank = metrics['iv_rank']
                self._set_cache(cache_key, float(iv_rank))
                logger.info(f"Tastytrade IV Rank for {symbol}: {iv_rank:.1f}%")
                return float(iv_rank)
        
        # Fallback: Calculate from historical volatility range
        return self._calculate_iv_rank_from_hv(symbol, current_iv)
    
    def _calculate_iv_rank_from_hv(self, symbol: str, current_iv: float) -> Optional[float]:
        """
        Fallback IV Rank calculation using historical volatility range.
        
        Note: This is an approximation since it uses HV instead of actual IV history.
        """
        cache_key = f"iv_rank_hv_{symbol}"
        
        try:
            ticker = yf.Ticker(symbol)
            
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
        cache_key = "risk_free_rate"
        
        # Use daily cache validation instead of time-based
        if self._is_daily_cache_valid(cache_key):
            cached_rate = self._cache[cache_key][1]
            cached_time = self._cache[cache_key][0]
            logger.info(f"Using cached risk-free rate from {cached_time.strftime('%Y-%m-%d %H:%M:%S')}: {cached_rate:.2%}")
            return cached_rate

        try:
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
                    logger.info(f"Fetched live risk-free rate (10Y Treasury): {rate:.2%} - cached until end of day")
                    return rate
                else:
                    logger.warning(f"Risk-free rate out of range: {rate}, using default")
            
        except Exception as e:
            logger.warning(f"Failed to fetch live risk-free rate: {e}")
        
        # Fallback to default
        rate = self.default_risk_free_rate
        self._set_cache(cache_key, rate)
        logger.info(f"Using default risk-free rate: {rate:.2%} - cached until end of day")
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
