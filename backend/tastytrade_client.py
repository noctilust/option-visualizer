"""
Tastytrade API Client for Options Visualizer
Uses direct REST API calls to the official Tastytrade API.

Requires TASTYTRADE_CLIENT_SECRET and TASTYTRADE_REFRESH_TOKEN environment variables.
Note: Sandbox accounts do NOT return market metrics - production account required.
"""

import os
import logging
import httpx
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# Tastytrade API endpoints
TASTYTRADE_API_URL = "https://api.tastyworks.com"


class TastytradeClient:
    """Client for Tastytrade API using direct REST calls"""

    def __init__(self):
        """
        Initialize Tastytrade client with OAuth credentials from environment.
        
        Requires:
        - TASTYTRADE_CLIENT_SECRET: OAuth client secret from your application
        - TASTYTRADE_REFRESH_TOKEN: Refresh token generated from Tastytrade
        
        See: https://my.tastytrade.com/app.html#/manage/api-access/oauth-applications
        """
        self.client_secret = os.getenv('TASTYTRADE_CLIENT_SECRET', '')
        self.refresh_token = os.getenv('TASTYTRADE_REFRESH_TOKEN', '')
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
        self._greeks_cache: Dict[str, Any] = {}  # Cache for option Greeks
        self._enabled = bool(self.client_secret and self.refresh_token)
        
        if not self._enabled:
            logger.info("Tastytrade OAuth credentials not configured - IV Rank will use fallback calculation")
        else:
            logger.info("Tastytrade client initialized with OAuth credentials")

    @property
    def is_enabled(self) -> bool:
        """Check if Tastytrade integration is enabled"""
        return self._enabled

    def _ensure_token(self) -> bool:
        """
        Ensure we have a valid access token, refreshing if needed.
        
        Returns:
            True if token is valid, False otherwise
        """
        if not self._enabled:
            return False

        # Check if token is still valid (tokens last 15 min, refresh at 14)
        if self._access_token is not None and self._token_expiry is not None:
            if datetime.now() < self._token_expiry:
                return True

        try:
            logger.info("Refreshing Tastytrade access token...")
            
            # OAuth token refresh via REST API
            response = httpx.post(
                f"{TASTYTRADE_API_URL}/oauth/token",
                data={
                    "grant_type": "refresh_token",
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token
                },
                timeout=10.0
            )
            response.raise_for_status()
            
            data = response.json()
            self._access_token = data.get("access_token")
            
            # Token expires in 'expires_in' seconds (usually 900 = 15 min)
            expires_in = data.get("expires_in", 900)
            # Refresh 1 minute early to avoid edge cases
            self._token_expiry = datetime.now() + timedelta(seconds=expires_in - 60)
            
            logger.info("Tastytrade access token refreshed successfully")
            return True
            
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to refresh Tastytrade token: {e.response.status_code} - {e.response.text}")
            self._access_token = None
            self._token_expiry = None
            return False
        except Exception as e:
            logger.error(f"Failed to refresh Tastytrade token: {e}")
            self._access_token = None
            self._token_expiry = None
            return False

    def get_market_metrics(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch market metrics for a symbol from Tastytrade.
        
        Args:
            symbol: Stock ticker symbol (e.g., 'AAPL')
            
        Returns:
            Dict with market metrics or None if unavailable:
            {
                'iv_rank': float,  # IV Rank (0-100)
                'iv_percentile': float,  # IV Percentile (0-100)
                'implied_volatility': float,  # 30-day IV (IVx) as decimal
                'beta': float,  # Stock beta
                'liquidity_rating': int,  # Options liquidity rating
            }
        """
        if not self._ensure_token():
            return None

        try:
            # Fetch market metrics via REST API
            response = httpx.get(
                f"{TASTYTRADE_API_URL}/market-metrics",
                params={"symbols": symbol},
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=10.0
            )
            response.raise_for_status()
            
            data = response.json()
            items = data.get("data", {}).get("items", [])
            
            if not items:
                logger.warning(f"No market metrics returned for {symbol}")
                return None

            metric = items[0]
            
            result = {
                'iv_rank': self._safe_float(metric.get("implied-volatility-index-rank"), multiply_by=100),
                'iv_percentile': self._safe_float(metric.get("implied-volatility-percentile"), multiply_by=100),
                'implied_volatility': self._safe_float(metric.get("implied-volatility-index")),
                'beta': self._safe_float(metric.get("beta")),
                'liquidity_rating': self._safe_int(metric.get("liquidity-rating")),
            }
            
            logger.info(f"Fetched Tastytrade metrics for {symbol}: IV Rank={result['iv_rank']}")
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"Error fetching Tastytrade metrics for {symbol}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error fetching Tastytrade metrics for {symbol}: {e}")
            return None

    def get_option_greeks(
        self,
        symbol: str,
        strike: float,
        expiration_date: str,  # "2025-02-20" ISO format
        option_type: str  # "C" or "P"
    ) -> Optional[Dict[str, float]]:
        """
        Get Greeks and IV for a specific option from Tastytrade API.

        Uses the /market-data endpoint which returns quotes with Greeks
        for options using OSI symbol format.

        Args:
            symbol: Underlying stock symbol (e.g., 'TSLA')
            strike: Option strike price
            expiration_date: Expiration in ISO format (YYYY-MM-DD)
            option_type: 'C' for call, 'P' for put

        Returns:
            Dict with delta, gamma, theta, vega, rho, implied_volatility or None if unavailable
        """
        if not self._ensure_token():
            return None

        # Check cache first (5-minute cache for Greeks)
        cache_key = f"greeks_{symbol}_{strike}_{expiration_date}_{option_type}"
        if cache_key in self._greeks_cache:
            cached_time, cached_data = self._greeks_cache[cache_key]
            if datetime.now() - cached_time < timedelta(minutes=5):
                logger.info(f"Greeks cache hit: {cache_key}")
                return cached_data

        try:
            # Convert to OSI symbol format: "SYMBOL  YYMMDD(C/P)00000000"
            osi_symbol = self._to_osi_symbol(symbol, expiration_date, strike, option_type)
            if not osi_symbol:
                logger.warning(f"Could not create OSI symbol for {symbol} {strike} {option_type} {expiration_date}")
                return None

            # Fetch option quote from /market-data endpoint
            response = httpx.get(
                f"{TASTYTRADE_API_URL}/market-data",
                params={"symbols": osi_symbol},
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=15.0
            )
            response.raise_for_status()

            data = response.json()
            items = data.get("data", {}).get("items", [])

            if not items:
                logger.warning(f"No quote data returned for {osi_symbol}")
                return None

            option_data = items[0]

            # Extract Greeks and pricing from API response
            # Note: Tastytrade returns "volatility" which is actually implied volatility
            # as a decimal (e.g., 0.8435 for 84.35% IV)
            greeks = {
                'delta': self._safe_float(option_data.get("delta")),
                'gamma': self._safe_float(option_data.get("gamma")),
                'theta': self._safe_float(option_data.get("theta")),
                'vega': self._safe_float(option_data.get("vega")),
                'rho': self._safe_float(option_data.get("rho")),
                'implied_volatility': self._safe_float(option_data.get("volatility")),
                # Also include pricing data
                'bid': self._safe_float(option_data.get("bid")),
                'ask': self._safe_float(option_data.get("ask")),
                'mark': self._safe_float(option_data.get("mark")),
                'last': self._safe_float(option_data.get("last")),
                'theo_price': self._safe_float(option_data.get("theo-price")),
            }

            # Validate we have at least some data
            if greeks['implied_volatility'] is None and greeks['delta'] is None:
                logger.warning(f"No Greeks data available for {osi_symbol}")
                return None

            # Cache the result
            self._greeks_cache[cache_key] = (datetime.now(), greeks)
            logger.info(f"Fetched Greeks for {osi_symbol}: "
                       f"IV={greeks['implied_volatility']:.2%}, delta={greeks['delta']:.4f}")
            return greeks

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching option Greeks for {symbol}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error fetching option Greeks for {symbol}: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def get_batch_option_greeks(
        self,
        positions: list  # List of dicts with symbol, strike, expiration_date, option_type
    ) -> Dict[str, Dict[str, float]]:
        """
        Fetch Greeks for multiple options in a single batch API call.

        This is much more efficient than calling get_option_greeks multiple times.

        Args:
            positions: List of dicts with keys: symbol, strike, expiration_date, option_type

        Returns:
            Dict mapping position_key -> Greeks dict
            position_key format: "{symbol}_{strike}_{expiration_date}_{option_type}"
        """
        if not self._ensure_token():
            return {}

        result = {}
        osi_symbols = []
        position_keys = []

        # Build list of OSI symbols and check cache
        for pos in positions:
            symbol = pos.get('symbol', '')
            strike = pos.get('strike', 0)
            expiration_date = pos.get('expiration_date', '')
            option_type = pos.get('option_type', 'C')

            position_key = f"{symbol}_{strike}_{expiration_date}_{option_type}"

            # Check cache first
            cache_key = f"greeks_{symbol}_{strike}_{expiration_date}_{option_type}"
            if cache_key in self._greeks_cache:
                cached_time, cached_data = self._greeks_cache[cache_key]
                if datetime.now() - cached_time < timedelta(minutes=5):
                    result[position_key] = cached_data
                    logger.info(f"Greeks cache hit: {position_key}")
                    continue

            # Create OSI symbol for API request
            osi_symbol = self._to_osi_symbol(symbol, expiration_date, strike, option_type)
            if osi_symbol:
                osi_symbols.append(osi_symbol)
                position_keys.append((position_key, symbol, strike, expiration_date, option_type))

        if not osi_symbols:
            return result  # All results were from cache

        try:
            # Batch fetch - API accepts multiple symbols separated by commas
            # But the API has a limit, so we chunk if needed
            chunk_size = 50  # API limit per request

            for i in range(0, len(osi_symbols), chunk_size):
                chunk = osi_symbols[i:i + chunk_size]
                symbols_param = ','.join(chunk)

                response = httpx.get(
                    f"{TASTYTRADE_API_URL}/market-data",
                    params={"symbols": symbols_param},
                    headers={"Authorization": f"Bearer {self._access_token}"},
                    timeout=30.0
                )
                response.raise_for_status()

                data = response.json()
                items = data.get("data", {}).get("items", [])

                # Map OSI symbols to their data
                items_map = {item.get("symbol", ""): item for item in items}

                # Process each position in this chunk
                for j in range(len(chunk)):
                    if i + j >= len(position_keys):
                        break

                    position_key, symbol, strike, expiration_date, option_type = position_keys[i + j]
                    osi_symbol = chunk[j]

                    if osi_symbol not in items_map:
                        logger.warning(f"No quote data returned for {osi_symbol}")
                        continue

                    option_data = items_map[osi_symbol]

                    greeks = {
                        'delta': self._safe_float(option_data.get("delta")),
                        'gamma': self._safe_float(option_data.get("gamma")),
                        'theta': self._safe_float(option_data.get("theta")),
                        'vega': self._safe_float(option_data.get("vega")),
                        'rho': self._safe_float(option_data.get("rho")),
                        'implied_volatility': self._safe_float(option_data.get("volatility")),
                        'bid': self._safe_float(option_data.get("bid")),
                        'ask': self._safe_float(option_data.get("ask")),
                        'mark': self._safe_float(option_data.get("mark")),
                        'last': self._safe_float(option_data.get("last")),
                        'theo_price': self._safe_float(option_data.get("theo-price")),
                    }

                    if greeks['implied_volatility'] is None and greeks['delta'] is None:
                        logger.warning(f"No Greeks data available for {osi_symbol}")
                        continue

                    # Cache the result
                    cache_key = f"greeks_{symbol}_{strike}_{expiration_date}_{option_type}"
                    self._greeks_cache[cache_key] = (datetime.now(), greeks)

                    result[position_key] = greeks
                    logger.info(f"Fetched Greeks for {osi_symbol}: "
                               f"IV={greeks['implied_volatility']:.2%}, delta={greeks['delta']:.4f}")

            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching batch option Greeks: {e.response.status_code}")
            return result
        except Exception as e:
            logger.error(f"Error fetching batch option Greeks: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return result

    def _to_osi_symbol(
        self,
        symbol: str,
        expiration_date: str,  # "2025-02-20"
        strike: float,
        option_type: str  # "C" or "P"
    ) -> Optional[str]:
        """
        Convert option parameters to OSI symbol format.

        OSI format: "SYMBOL  YYMMDD(C/P)00000000"
        - Symbol: 6 chars (right-aligned, padded with spaces)
        - YY: last 2 digits of year
        - MM: month (01-12)
        - DD: day (01-31)
        - C/P: Call or Put
        - 8 digits for strike (no decimal, padded with zeros)

        Example: "TSLA  260102C00080000" = TSLA $80 Call expiring 2026-01-02

        Args:
            symbol: Stock symbol
            expiration_date: ISO format date string (YYYY-MM-DD)
            strike: Strike price
            option_type: 'C' or 'P'

        Returns:
            OSI symbol string or None if parsing fails
        """
        try:
            # Parse expiration date
            from datetime import datetime
            exp = datetime.strptime(expiration_date, "%Y-%m-%d")

            # Format parts
            symbol_part = symbol.upper().ljust(6)[:6]  # Left-align, pad with spaces, max 6 chars
            year_part = exp.strftime("%y")  # Last 2 digits of year
            month_day = exp.strftime("%m%d")  # MMDD
            type_part = option_type.upper()

            # Format strike as 8 digits (no decimal)
            # Multiply by 1000 to handle fractional strikes, then format as int
            strike_int = int(round(strike * 1000))
            strike_part = f"{strike_int:08d}"

            return f"{symbol_part}{year_part}{month_day}{type_part}{strike_part}"

        except Exception as e:
            logger.error(f"Error creating OSI symbol: {e}")
            return None

    def search_symbols(self, query: str) -> list:
        """
        Search for symbols using Tastytrade API with Yahoo Finance fallback.

        Args:
            query: Search query (e.g., 'AAPL' or 'Apple')

        Returns:
            List of matching symbols with metadata
        """
        if not self._ensure_token():
            # Fallback: If Tastytrade not configured, use Yahoo Finance to validate
            logger.info(f"Tastytrade not configured, using Yahoo Finance fallback for: {query}")
            return self._search_symbols_fallback(query)

        try:
            response = httpx.get(
                f"{TASTYTRADE_API_URL}/symbols/search/{query}",
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=10.0
            )
            response.raise_for_status()

            data = response.json()
            items = data.get("data", {}).get("items", [])

            results = []
            for item in items:
                instrument_type = item.get("instrument-type", "")
                is_etf = item.get("etf", False)

                # Only include Equity instruments
                if instrument_type == "Equity":
                    results.append({
                        "symbol": item.get("symbol", ""),
                        "name": item.get("description", ""),
                        "exchange": item.get("listed-market", ""),
                        "type": "ETF" if is_etf else "EQUITY"
                    })

            return results

        except Exception as e:
            logger.error(f"Error searching symbols via Tastytrade: {e}, falling back to Yahoo Finance")
            return self._search_symbols_fallback(query)

    def _search_symbols_fallback(self, query: str) -> list:
        """
        Fallback symbol search using Yahoo Finance validation.

        This is used when Tastytrade is unavailable or returns no results.
        """
        import yfinance as yf

        if not query or len(query.strip()) < 1:
            return []

        query_upper = query.strip().upper()

        try:
            # Try to fetch info for the exact symbol from Yahoo Finance
            ticker = yf.Ticker(query_upper)
            info = ticker.info

            # Check if this is a valid ticker (has a quote type)
            if info and info.get('quoteType'):
                quote_type = info.get('quoteType', '')
                long_name = info.get('longName', info.get('shortName', query_upper))

                # Only return if it's a stock or ETF
                if quote_type in ['EQUITY', 'ETF']:
                    return [{
                        "symbol": query_upper,
                        "name": long_name,
                        "exchange": info.get('exchange', 'Unknown'),
                        "type": quote_type
                    }]

            logger.info(f"No valid ticker found for: {query_upper}")
            return []

        except Exception as e:
            logger.warning(f"Yahoo Finance fallback search failed for {query}: {e}")
            # If even Yahoo Finance fails, return the symbol anyway to let user proceed
            # Market data fetch will validate it later
            return [{
                "symbol": query_upper,
                "name": query_upper,
                "exchange": "Unknown",
                "type": "EQUITY"
            }]

    def _safe_float(self, value: Any, divide_by: float = 1, multiply_by: float = 1) -> Optional[float]:
        """Safely convert value to float with optional scaling"""
        if value is None:
            return None
        try:
            return float(value) * multiply_by / divide_by
        except (TypeError, ValueError):
            return None

    def _safe_int(self, value: Any) -> Optional[int]:
        """Safely convert value to int"""
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


# Global singleton instance
_tastytrade_client: Optional[TastytradeClient] = None


def get_tastytrade_client() -> TastytradeClient:
    """Get or create the global Tastytrade client instance"""
    global _tastytrade_client
    if _tastytrade_client is None:
        _tastytrade_client = TastytradeClient()
    return _tastytrade_client
