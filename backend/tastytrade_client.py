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
                'implied_volatility': self._safe_float(metric.get("implied-volatility-index"), divide_by=100),
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
        Fetch Greeks for a specific option from Tastytrade option chain.
        
        Args:
            symbol: Underlying stock symbol (e.g., 'PLTR')
            strike: Option strike price
            expiration_date: Expiration in ISO format (YYYY-MM-DD)
            option_type: 'C' for call, 'P' for put
        
        Returns:
            Dict with delta, gamma, theta, vega, rho or None if unavailable
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
            # Fetch option chain for the symbol
            response = httpx.get(
                f"{TASTYTRADE_API_URL}/option-chains/{symbol}/nested",
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=15.0
            )
            response.raise_for_status()
            
            data = response.json()
            expirations = data.get("data", {}).get("items", [])
            
            # Find matching expiration
            for exp in expirations:
                exp_date = exp.get("expiration-date", "")
                if exp_date != expiration_date:
                    continue
                
                # Found expiration, now find strike
                strikes = exp.get("strikes", [])
                for strike_data in strikes:
                    strike_price = self._safe_float(strike_data.get("strike-price"))
                    if strike_price is None or abs(strike_price - strike) > 0.01:
                        continue
                    
                    # Found strike, get call or put
                    if option_type.upper() == 'C':
                        option = strike_data.get("call")
                    else:
                        option = strike_data.get("put")
                    
                    if option:
                        greeks = {
                            'delta': self._safe_float(option.get("delta")) or 0.0,
                            'gamma': self._safe_float(option.get("gamma")) or 0.0,
                            'theta': self._safe_float(option.get("theta")) or 0.0,
                            'vega': self._safe_float(option.get("vega")) or 0.0,
                            'rho': self._safe_float(option.get("rho")) or 0.0,
                        }
                        
                        # Cache the result
                        self._greeks_cache[cache_key] = (datetime.now(), greeks)
                        logger.info(f"Fetched Tastytrade Greeks for {symbol} {strike} {option_type} {expiration_date}: delta={greeks['delta']:.4f}")
                        return greeks
            
            logger.warning(f"Option not found in chain: {symbol} {strike} {option_type} {expiration_date}")
            return None

        except httpx.HTTPStatusError as e:
            logger.error(f"Error fetching option chain for {symbol}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error fetching option Greeks for {symbol}: {e}")
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
