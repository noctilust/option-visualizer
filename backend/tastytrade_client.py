"""
Tastytrade API Client for Options Visualizer
Uses direct REST API calls to the official Tastytrade API.

Requires TASTYTRADE_CLIENT_SECRET and TASTYTRADE_REFRESH_TOKEN environment variables.
Note: Sandbox accounts do NOT return market metrics - production account required.
"""

import os
import logging
import time
import threading
import httpx
from collections import OrderedDict
from concurrent.futures import Future
from copy import deepcopy
from email.utils import parsedate_to_datetime
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# Tastytrade API endpoints
TASTYTRADE_API_URL = "https://api.tastyworks.com"
SKEW_TARGET_DELTA = 0.25
SKEW_DELTA_TOLERANCE = 0.05
SKEW_ATM_MONEYNESS_TOLERANCE = 0.05


def _env_float(name: str, default: float) -> float:
    """Read a non-negative float setting without making startup fragile."""
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid %s; using %s", name, default)
        return default


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    """Read a bounded integer setting without making startup fragile."""
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid %s; using %s", name, default)
        return default


# Tastytrade does not publish a single fixed request allowance for every API
# consumer. Keep a conservative, configurable process-wide guard and observe
# provider-supplied rate headers instead of assuming an undocumented limit.
_REQUEST_MAX_CONCURRENCY = _env_int("TASTYTRADE_MAX_CONCURRENT_REQUESTS", 2)
_REQUEST_SEMAPHORE = threading.BoundedSemaphore(_REQUEST_MAX_CONCURRENCY)
_REQUEST_PACING_LOCK = threading.Lock()
_NEXT_REQUEST_AT = 0.0


def summarize_volatility_skew(
    points: list[Dict[str, Any]],
    current_price: float,
) -> Dict[str, Any]:
    """Summarize put-minus-call IV skew using the closest 25-delta options."""
    call_candidates = [
        point
        for point in points
        if point.get("call_delta") is not None
        and point.get("call_iv") is not None
        and abs(point["call_delta"] - SKEW_TARGET_DELTA) <= SKEW_DELTA_TOLERANCE
    ]
    put_candidates = [
        point
        for point in points
        if point.get("put_delta") is not None
        and point.get("put_iv") is not None
        and abs(point["put_delta"] + SKEW_TARGET_DELTA) <= SKEW_DELTA_TOLERANCE
    ]

    call_point = min(
        call_candidates,
        key=lambda point: abs(point["call_delta"] - SKEW_TARGET_DELTA),
        default=None,
    )
    put_point = min(
        put_candidates,
        key=lambda point: abs(point["put_delta"] + SKEW_TARGET_DELTA),
        default=None,
    )

    if call_point is not None and put_point is not None:
        return {
            "skew_metric": put_point["put_iv"] - call_point["call_iv"],
            "skew_basis": "25_delta",
            "call_selection": {
                "strike": call_point["strike"],
                "delta": call_point["call_delta"],
                "iv": call_point["call_iv"],
            },
            "put_selection": {
                "strike": put_point["strike"],
                "delta": put_point["put_delta"],
                "iv": put_point["put_iv"],
            },
        }

    atm_point = min(
        (
            point
            for point in points
            if point.get("strike") is not None
            and point.get("call_iv") is not None
            and point.get("put_iv") is not None
            and current_price > 0
            and abs(point["strike"] - current_price) / current_price
            <= SKEW_ATM_MONEYNESS_TOLERANCE
        ),
        key=lambda point: abs(point["strike"] - current_price),
        default=None,
    )

    if atm_point is not None:
        return {
            "skew_metric": atm_point["put_iv"] - atm_point["call_iv"],
            "skew_basis": "atm",
            "call_selection": {
                "strike": atm_point["strike"],
                "delta": atm_point.get("call_delta"),
                "iv": atm_point["call_iv"],
            },
            "put_selection": {
                "strike": atm_point["strike"],
                "delta": atm_point.get("put_delta"),
                "iv": atm_point["put_iv"],
            },
        }

    return {
        "skew_metric": None,
        "skew_basis": "unavailable",
        "call_selection": None,
        "put_selection": None,
    }


class TastytradeClient:
    """Client for Tastytrade API using direct REST calls"""

    def __init__(self, http_client: httpx.Client | None = None):
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
        self._token_lock = threading.Lock()
        self._greeks_cache: OrderedDict[
            str, tuple[float, Dict[str, Any]]
        ] = OrderedDict()
        self._greeks_cache_lock = threading.Lock()
        self._greeks_cache_ttl_seconds = _env_float(
            "TASTYTRADE_GREEKS_CACHE_SECONDS", 300.0
        )
        self._greeks_cache_max_entries = _env_int(
            "TASTYTRADE_GREEKS_CACHE_MAX_ENTRIES", 4096
        )
        self._skew_cache: OrderedDict[
            tuple[str, str, float], tuple[float, Dict[str, Any]]
        ] = OrderedDict()
        self._skew_inflight: Dict[
            tuple[str, str, float], Future[Dict[str, Any]]
        ] = {}
        self._skew_cache_lock = threading.Lock()
        self._skew_cache_ttl_seconds = _env_float(
            "TASTYTRADE_SKEW_CACHE_SECONDS", 300.0
        )
        self._skew_negative_cache_ttl_seconds = _env_float(
            "TASTYTRADE_SKEW_NEGATIVE_CACHE_SECONDS", 45.0
        )
        self._skew_cache_max_entries = _env_int(
            "TASTYTRADE_SKEW_CACHE_MAX_ENTRIES", 32
        )
        self._option_chain_cache: OrderedDict[
            str, tuple[float, Dict[str, Any]]
        ] = OrderedDict()
        self._option_chain_inflight: Dict[
            str, Future[Dict[str, Any]]
        ] = {}
        self._option_chain_cache_lock = threading.Lock()
        self._option_chain_cache_ttl_seconds = _env_float(
            "TASTYTRADE_OPTION_CHAIN_CACHE_SECONDS", 300.0
        )
        self._option_chain_cache_max_entries = _env_int(
            "TASTYTRADE_OPTION_CHAIN_CACHE_MAX_ENTRIES", 32
        )
        self._request_min_interval_seconds = _env_float(
            "TASTYTRADE_MIN_REQUEST_INTERVAL_SECONDS", 0.25
        )
        self._rate_limit_retries = _env_int(
            "TASTYTRADE_RATE_LIMIT_RETRIES", 2, minimum=0
        )
        self._rate_limit_max_delay_seconds = _env_float(
            "TASTYTRADE_RATE_LIMIT_MAX_DELAY_SECONDS", 30.0
        )
        self._http_client = http_client or httpx.Client(
            limits=httpx.Limits(
                max_connections=8,
                max_keepalive_connections=4,
                keepalive_expiry=30.0,
            )
        )
        self._owns_http_client = http_client is None
        self._enabled = bool(self.client_secret and self.refresh_token)
        
        if not self._enabled:
            logger.info("Tastytrade OAuth credentials not configured - IV Rank will use fallback calculation")
        else:
            logger.info("Tastytrade client initialized with OAuth credentials")

    @property
    def is_enabled(self) -> bool:
        """Check if Tastytrade integration is enabled"""
        return self._enabled

    def close(self) -> None:
        """Close the persistent HTTP connection pool owned by this client."""
        if self._owns_http_client:
            self._http_client.close()

    def _get_cached_greeks(
        self, cache_key: str
    ) -> Optional[Dict[str, Any]]:
        """Return a fresh copy and keep the bounded cache in LRU order."""
        now = time.monotonic()
        with self._greeks_cache_lock:
            cached = self._greeks_cache.get(cache_key)
            if cached is None:
                return None

            cached_at, cached_data = cached
            if now - cached_at >= self._greeks_cache_ttl_seconds:
                del self._greeks_cache[cache_key]
                return None

            self._greeks_cache.move_to_end(cache_key)
            return deepcopy(cached_data)

    def _cache_greeks(
        self, cache_key: str, greeks: Dict[str, Any]
    ) -> None:
        """Store a defensive copy and evict the least recently used entries."""
        with self._greeks_cache_lock:
            self._greeks_cache[cache_key] = (
                time.monotonic(),
                deepcopy(greeks),
            )
            self._greeks_cache.move_to_end(cache_key)
            while len(self._greeks_cache) > self._greeks_cache_max_entries:
                self._greeks_cache.popitem(last=False)

    def _observe_rate_limit_headers(self, response: httpx.Response) -> None:
        """Log provider-supplied rate telemetry without assuming fixed limits."""
        limit = response.headers.get("ratelimit-limit") or response.headers.get(
            "x-ratelimit-limit"
        )
        remaining = response.headers.get(
            "ratelimit-remaining"
        ) or response.headers.get("x-ratelimit-remaining")
        reset = response.headers.get("ratelimit-reset") or response.headers.get(
            "x-ratelimit-reset"
        )

        if limit is not None or remaining is not None or reset is not None:
            logger.debug(
                "Tastytrade rate headers: limit=%s remaining=%s reset=%s",
                limit,
                remaining,
                reset,
            )
        if remaining == "0":
            logger.warning("Tastytrade reports no remaining requests before reset=%s", reset)

    def _retry_after_seconds(
        self, response: httpx.Response, attempt: int
    ) -> float | None:
        """Return a bounded delay, or decline a retry beyond the configured cap."""
        retry_after = response.headers.get("retry-after")
        delay: float | None = None

        if retry_after:
            try:
                delay = max(0.0, float(retry_after))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    delay = max(
                        0.0,
                        (retry_at - datetime.now(timezone.utc)).total_seconds(),
                    )
                except (TypeError, ValueError, OverflowError):
                    logger.warning(
                        "Ignoring invalid Tastytrade Retry-After header: %s",
                        retry_after,
                    )

        if delay is None:
            delay = 0.5 * (2**attempt)

        if retry_after and delay > self._rate_limit_max_delay_seconds:
            return None
        return min(delay, self._rate_limit_max_delay_seconds)

    def _pace_request(self) -> None:
        """Reserve the next process-wide request slot."""
        global _NEXT_REQUEST_AT

        with _REQUEST_PACING_LOCK:
            now = time.monotonic()
            wait_seconds = max(0.0, _NEXT_REQUEST_AT - now)
            if wait_seconds:
                time.sleep(wait_seconds)
                now = time.monotonic()
            _NEXT_REQUEST_AT = now + self._request_min_interval_seconds

    def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        """Issue a pooled, paced request with bounded HTTP 429 retries."""
        for attempt in range(self._rate_limit_retries + 1):
            with _REQUEST_SEMAPHORE:
                self._pace_request()
                response = self._http_client.request(method, url, **kwargs)

            self._observe_rate_limit_headers(response)
            if response.status_code != 429 or attempt >= self._rate_limit_retries:
                return response

            delay = self._retry_after_seconds(response, attempt)
            if delay is None:
                logger.warning(
                    "Tastytrade Retry-After exceeds the %.2fs retry budget; "
                    "returning HTTP 429 without an early retry",
                    self._rate_limit_max_delay_seconds,
                )
                return response
            logger.warning(
                "Tastytrade rate limited %s %s; retrying in %.2fs (%s/%s)",
                method.upper(),
                url,
                delay,
                attempt + 1,
                self._rate_limit_retries,
            )
            time.sleep(delay)

        raise RuntimeError("Unreachable Tastytrade request retry state")

    def _ensure_token(self) -> bool:
        """
        Ensure we have a valid access token, refreshing if needed.
        
        Returns:
            True if token is valid, False otherwise
        """
        if not self._enabled:
            return False

        # Check if token is still valid (tokens last 15 min, refresh at 14).
        if self._access_token is not None and self._token_expiry is not None:
            if datetime.now() < self._token_expiry:
                return True

        # Multiple prefetch requests may arrive together. Only one should refresh
        # OAuth credentials while the others reuse the refreshed token.
        with self._token_lock:
            if self._access_token is not None and self._token_expiry is not None:
                if datetime.now() < self._token_expiry:
                    return True

            try:
                logger.info("Refreshing Tastytrade access token...")

                response = self._request(
                    "POST",
                    f"{TASTYTRADE_API_URL}/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_secret": self.client_secret,
                        "refresh_token": self.refresh_token,
                    },
                    timeout=10.0,
                )
                response.raise_for_status()

                data = response.json()
                self._access_token = data.get("access_token")

                # Refresh 1 minute early to avoid edge cases.
                expires_in = data.get("expires_in", 900)
                self._token_expiry = datetime.now() + timedelta(
                    seconds=max(0, expires_in - 60)
                )

                logger.info("Tastytrade access token refreshed successfully")
                return bool(self._access_token)

            except httpx.HTTPStatusError as e:
                logger.error(
                    "Failed to refresh Tastytrade token: %s - %s",
                    e.response.status_code,
                    e.response.text,
                )
                self._access_token = None
                self._token_expiry = None
                return False
            except Exception as e:
                logger.error("Failed to refresh Tastytrade token: %s", e)
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
            response = self._request(
                "GET",
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
        cached_data = self._get_cached_greeks(cache_key)
        if cached_data is not None:
            logger.info(f"Greeks cache hit: {cache_key}")
            return cached_data

        try:
            # Convert to OSI symbol format: "SYMBOL  YYMMDD(C/P)00000000"
            osi_symbol = self._to_osi_symbol(symbol, expiration_date, strike, option_type)
            if not osi_symbol:
                logger.warning(f"Could not create OSI symbol for {symbol} {strike} {option_type} {expiration_date}")
                return None

            # Fetch option quote from /market-data endpoint
            response = self._request(
                "GET",
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
            self._cache_greeks(cache_key, greeks)
            logger.debug(
                "Fetched Greeks for %s: IV=%s, delta=%s",
                osi_symbol,
                greeks["implied_volatility"],
                greeks["delta"],
            )
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
            cached_data = self._get_cached_greeks(cache_key)
            if cached_data is not None:
                result[position_key] = cached_data
                logger.debug("Greeks cache hit: %s", position_key)
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

                response = self._request(
                    "GET",
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
                    self._cache_greeks(cache_key, greeks)

                    result[position_key] = greeks
                    logger.debug(
                        "Fetched Greeks for %s: IV=%s, delta=%s",
                        osi_symbol,
                        greeks["implied_volatility"],
                        greeks["delta"],
                    )

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
            response = self._request(
                "GET",
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

                # Include Equity and Index instruments
                if instrument_type in ["Equity", "Index"]:
                    results.append({
                        "symbol": item.get("symbol", ""),
                        "name": item.get("description", ""),
                        "exchange": item.get("listed-market", ""),
                        "type": "INDEX" if instrument_type == "Index" else ("ETF" if is_etf else "EQUITY")
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

    def _generate_strikes_around_price(self, current_price: float) -> list:
        """
        Generate a list of strike prices around the current price.

        Creates strikes from 50% to 150% of current price in $5 or $10 increments.

        Args:
            current_price: Current underlying price

        Returns:
            List of strike prices
        """
        from datetime import datetime

        # Determine strike interval based on price
        if current_price < 50:
            interval = 2.5
        elif current_price < 200:
            interval = 5
        elif current_price < 500:
            interval = 10
        else:
            interval = 20

        min_strike = current_price * 0.5
        max_strike = current_price * 1.5

        strikes = []
        current = round(min_strike / interval) * interval
        while current <= max_strike:
            strikes.append(round(current, 1))
            current += interval

        return strikes

    def get_option_chain(
        self, symbol: str, current_price: float | None = None
    ) -> Dict[str, Any]:
        """Return a bounded cached chain and deduplicate concurrent misses."""
        cache_key = symbol.strip().upper()
        now = time.monotonic()

        with self._option_chain_cache_lock:
            cached = self._option_chain_cache.get(cache_key)
            if cached is not None:
                cached_at, cached_result = cached
                if now - cached_at < self._option_chain_cache_ttl_seconds:
                    self._option_chain_cache.move_to_end(cache_key)
                    return deepcopy(cached_result)
                del self._option_chain_cache[cache_key]

            future = self._option_chain_inflight.get(cache_key)
            is_owner = future is None
            if future is None:
                future = Future()
                self._option_chain_inflight[cache_key] = future

        if not is_owner:
            return deepcopy(future.result())

        result = self._fetch_option_chain(cache_key, current_price)

        with self._option_chain_cache_lock:
            if result.get("expirations"):
                self._option_chain_cache[cache_key] = (
                    time.monotonic(),
                    deepcopy(result),
                )
                self._option_chain_cache.move_to_end(cache_key)
                while (
                    len(self._option_chain_cache)
                    > self._option_chain_cache_max_entries
                ):
                    self._option_chain_cache.popitem(last=False)
            self._option_chain_inflight.pop(cache_key, None)
            future.set_result(deepcopy(result))

        return deepcopy(result)

    def _fetch_option_chain(
        self, symbol: str, current_price: float | None = None
    ) -> Dict[str, Any]:
        """
        Fetch option chain data (expirations and strikes) from Tastytrade API.

        Args:
            symbol: Stock symbol (e.g., 'AAPL')

        Returns:
            Dict with:
                - expirations: list of expiration dates in ISO format
                - strikes_by_expiration: dict mapping expiration -> list of strikes
                - underlying_price: current underlying price
        """
        if not self._ensure_token():
            return {"expirations": [], "strikes_by_expiration": {}, "underlying_price": None}

        try:
            # The documented nested endpoint returns expirations and strikes in
            # one response. This replaces the former /expirations + /strikes
            # calls, which are not part of the current API surface.
            response = self._request(
                "GET",
                f"{TASTYTRADE_API_URL}/option-chains/{symbol}/nested",
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=20.0,
            )

            if response.status_code == 404:
                logger.warning("No option chain found for %s", symbol)
                return {
                    "expirations": [],
                    "strikes_by_expiration": {},
                    "underlying_price": None,
                }

            response.raise_for_status()
            data = response.json().get("data", {})
            chain_items = data.get("items", [])
            if isinstance(chain_items, dict):
                chain_items = [chain_items]
            if not chain_items and data.get("expirations"):
                chain_items = [data]

            strikes_by_expiration: Dict[str, list[float]] = {}
            underlying_price = self._safe_float(data.get("underlying-price"))

            for chain in chain_items:
                if underlying_price is None:
                    underlying_price = self._safe_float(
                        chain.get("underlying-price")
                    )

                for expiration_item in chain.get("expirations", []):
                    raw_expiration = str(
                        expiration_item.get("expiration-date", "")
                    )
                    try:
                        if "T" in raw_expiration:
                            expiration_date = datetime.fromisoformat(
                                raw_expiration.replace("Z", "+00:00").replace(
                                    "+0000", "+00:00"
                                )
                            )
                        else:
                            expiration_date = datetime.strptime(
                                raw_expiration, "%Y-%m-%d"
                            )
                        expiration = expiration_date.strftime("%Y-%m-%d")
                    except (TypeError, ValueError):
                        logger.warning(
                            "Could not parse expiration date %s", raw_expiration
                        )
                        continue

                    expiration_strikes = strikes_by_expiration.setdefault(
                        expiration, []
                    )
                    for strike_item in expiration_item.get("strikes", []):
                        raw_strike = (
                            strike_item.get("strike-price")
                            if isinstance(strike_item, dict)
                            else strike_item
                        )
                        strike = self._safe_float(raw_strike)
                        if strike is not None:
                            expiration_strikes.append(strike)

            for expiration, strikes in strikes_by_expiration.items():
                strikes_by_expiration[expiration] = sorted(set(strikes))

            expirations = sorted(strikes_by_expiration)
            if not expirations:
                logger.warning("No valid expirations found for %s", symbol)
                return {
                    "expirations": [],
                    "strikes_by_expiration": {},
                    "underlying_price": underlying_price,
                }

            logger.info(
                "Fetched option chain for %s: %s expirations, %s strikes",
                symbol,
                len(expirations),
                sum(len(strikes) for strikes in strikes_by_expiration.values()),
            )

            return {
                "expirations": expirations,
                "strikes_by_expiration": strikes_by_expiration,
                "underlying_price": underlying_price,
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching option chain for {symbol}: {e.response.status_code}")
            return {"expirations": [], "strikes_by_expiration": {}, "underlying_price": None}
        except Exception as e:
            logger.error(f"Error fetching option chain for {symbol}: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return {"expirations": [], "strikes_by_expiration": {}, "underlying_price": None}

    @staticmethod
    def _empty_volatility_smile(
        current_price: float,
        data_status: str = "provider_error",
    ) -> Dict[str, Any]:
        return {
            "points": [],
            "atm_iv": 0,
            "data_status": data_status,
            **summarize_volatility_skew([], current_price),
        }

    @staticmethod
    def _is_cacheable_volatility_smile(result: Dict[str, Any]) -> bool:
        """Only cache a smile when the provider returned usable quote data."""
        return any(
            point.get("call_iv") is not None or point.get("put_iv") is not None
            for point in result.get("points", [])
        )

    def get_volatility_smile(
        self,
        symbol: str,
        expiration: str,
        current_price: float,
    ) -> Dict[str, Any]:
        """Return a bounded cached smile and deduplicate concurrent misses."""
        # The strike grid is generated from spot, so price belongs in the key.
        # Market data is cached upstream, making this stable during near/far
        # prefetch while preventing a later price snapshot from reusing it.
        cache_key = (symbol.upper(), expiration, round(current_price, 4))
        now = time.monotonic()

        with self._skew_cache_lock:
            cached = self._skew_cache.get(cache_key)
            if cached is not None:
                cached_at, cached_result = cached
                cache_ttl = (
                    self._skew_negative_cache_ttl_seconds
                    if cached_result.get("data_status") == "no_quotes"
                    else self._skew_cache_ttl_seconds
                )
                if now - cached_at < cache_ttl:
                    self._skew_cache.move_to_end(cache_key)
                    logger.info(
                        "Volatility skew cache hit: %s %s",
                        cache_key[0],
                        cache_key[1],
                    )
                    return deepcopy(cached_result)
                del self._skew_cache[cache_key]

            future = self._skew_inflight.get(cache_key)
            is_owner = future is None
            if future is None:
                future = Future()
                self._skew_inflight[cache_key] = future

        if not is_owner:
            logger.info(
                "Joining in-flight volatility skew request: %s %s",
                cache_key[0],
                cache_key[1],
            )
            return deepcopy(future.result())

        try:
            result = self._fetch_volatility_smile(
                cache_key[0], expiration, current_price
            )
        except Exception as exc:
            logger.exception(
                "Unexpected error fetching volatility smile for %s: %s",
                cache_key[0],
                exc,
            )
            result = self._empty_volatility_smile(current_price)

        with self._skew_cache_lock:
            if (
                self._is_cacheable_volatility_smile(result)
                or result.get("data_status") == "no_quotes"
            ):
                self._skew_cache[cache_key] = (time.monotonic(), deepcopy(result))
                self._skew_cache.move_to_end(cache_key)
                while len(self._skew_cache) > self._skew_cache_max_entries:
                    self._skew_cache.popitem(last=False)
            self._skew_inflight.pop(cache_key, None)
            future.set_result(deepcopy(result))

        return deepcopy(result)

    def _fetch_volatility_smile(
        self,
        symbol: str,
        expiration: str,
        current_price: float
    ) -> Dict[str, Any]:
        """
        Fetch volatility smile data for the exact requested expiration.

        Args:
            symbol: Stock symbol
            expiration: Expiration date in ISO format (YYYY-MM-DD)
            current_price: Current underlying price

        Returns:
            Dict with:
                - points: list of SmileDataPoint with strike, iv, delta, etc.
                - atm_iv: IV at nearest strike to current price
                - skew_metric: put IV minus call IV
                - skew_basis: 25_delta, atm, or unavailable
                - call_selection/put_selection: legs used for the metric
        """
        if not self._ensure_token():
            return self._empty_volatility_smile(current_price)

        try:
            # Generate strikes dynamically around current price
            filtered_strikes = self._generate_strikes_around_price(current_price)

            if not filtered_strikes:
                logger.warning(f"Could not generate strikes for {symbol} at price {current_price}")
                return self._empty_volatility_smile(current_price)

            # Build positions list for batch fetch
            positions = []
            for strike in filtered_strikes:
                positions.append({
                    "symbol": symbol,
                    "strike": strike,
                    "expiration_date": expiration,
                    "option_type": "C"
                })
                positions.append({
                    "symbol": symbol,
                    "strike": strike,
                    "expiration_date": expiration,
                    "option_type": "P"
                })

            # Batch fetch all Greeks
            greeks_data = self.get_batch_option_greeks(positions)

            # Build smile data points
            points = []
            atm_iv = 0
            nearest_distance = float('inf')

            for strike in filtered_strikes:
                call_key = f"{symbol}_{strike}_{expiration}_C"
                put_key = f"{symbol}_{strike}_{expiration}_P"

                call_data = greeks_data.get(call_key)
                put_data = greeks_data.get(put_key)

                point = {
                    "strike": strike,
                    "call_iv": call_data.get("implied_volatility") if call_data else None,
                    "put_iv": put_data.get("implied_volatility") if put_data else None,
                    "call_delta": call_data.get("delta") if call_data else None,
                    "put_delta": put_data.get("delta") if put_data else None,
                    "call_bid": call_data.get("bid") if call_data else None,
                    "call_ask": call_data.get("ask") if call_data else None,
                    "put_bid": put_data.get("bid") if put_data else None,
                    "put_ask": put_data.get("ask") if put_data else None,
                }

                # Track ATM IV (nearest strike to current price)
                distance = abs(strike - current_price)
                if distance < nearest_distance:
                    nearest_distance = distance
                    # Use average of call and put IV at ATM
                    call_iv = point["call_iv"] or 0
                    put_iv = point["put_iv"] or 0
                    if call_iv and put_iv:
                        atm_iv = (call_iv + put_iv) / 2
                    elif call_iv:
                        atm_iv = call_iv
                    elif put_iv:
                        atm_iv = put_iv

                points.append(point)

            skew_summary = summarize_volatility_skew(points, current_price)
            has_quotes = self._is_cacheable_volatility_smile({"points": points})
            data_status = "ok" if has_quotes else "no_quotes"

            logger.info(f"Fetched volatility smile for {symbol} {expiration}: "
                       f"{len(points)} strikes, ATM IV={atm_iv:.2%}, "
                       f"Skew={skew_summary['skew_metric']} ({skew_summary['skew_basis']})")

            return {
                "points": points,
                "atm_iv": atm_iv,
                "data_status": data_status,
                **skew_summary,
            }

        except Exception as e:
            logger.error(f"Error fetching volatility smile for {symbol}: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return self._empty_volatility_smile(current_price)

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
_tastytrade_client_lock = threading.Lock()


def get_tastytrade_client() -> TastytradeClient:
    """Get or create the global Tastytrade client instance"""
    global _tastytrade_client
    if _tastytrade_client is None:
        with _tastytrade_client_lock:
            if _tastytrade_client is None:
                _tastytrade_client = TastytradeClient()
    return _tastytrade_client


def close_tastytrade_client() -> None:
    """Release the singleton's persistent HTTP pool during app shutdown."""
    global _tastytrade_client
    with _tastytrade_client_lock:
        client = _tastytrade_client
        _tastytrade_client = None
    if client is not None:
        client.close()
