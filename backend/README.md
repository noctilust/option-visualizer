# Option Visualizer Backend

FastAPI backend for options P/L calculation and market data.

## Setup

```bash
cp .env.example .env  # Add API keys
uv sync
uv run uvicorn main:app --reload --port 8000
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for OCR |
| `TASTYTRADE_CLIENT_SECRET` | Tastytrade OAuth client secret |
| `TASTYTRADE_REFRESH_TOKEN` | Tastytrade OAuth refresh token |

**Optional:**

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_OCR_MODEL` | Gemini model used for screenshot OCR | `gemini-3.1-flash-lite` |
| `GEMINI_OCR_MAX_DIMENSION` | Longest image side sent to Gemini, for cost control | `1024` |
| `DEFAULT_RISK_FREE_RATE` | Override risk-free rate | `0.045` |
| `DEFAULT_IMPLIED_VOLATILITY` | Override implied volatility | `0.25` |
| `MARKET_DATA_CACHE_MINUTES` | Cache duration | `30` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | localhost |
| `TASTYTRADE_MAX_CONCURRENT_REQUESTS` | Process-wide upstream request concurrency | `2` |
| `TASTYTRADE_MIN_REQUEST_INTERVAL_SECONDS` | Minimum time between upstream request starts | `0.25` |
| `TASTYTRADE_RATE_LIMIT_RETRIES` | Retries after HTTP 429 | `2` |
| `TASTYTRADE_RATE_LIMIT_MAX_DELAY_SECONDS` | Largest Retry-After delay handled in-process | `30` |
| `TASTYTRADE_SKEW_CACHE_SECONDS` | Whole-skew cache TTL | `300` |
| `TASTYTRADE_SKEW_NEGATIVE_CACHE_SECONDS` | Quote-less skew cycle cache TTL | `45` |
| `TASTYTRADE_SKEW_CACHE_MAX_ENTRIES` | Whole-skew LRU capacity | `32` |
| `TASTYTRADE_OPTION_CHAIN_CACHE_SECONDS` | Option-chain cache TTL | `300` |
| `TASTYTRADE_OPTION_CHAIN_CACHE_MAX_ENTRIES` | Option-chain LRU capacity | `32` |
| `TASTYTRADE_GREEKS_CACHE_SECONDS` | Per-contract Greeks cache TTL | `300` |
| `TASTYTRADE_GREEKS_CACHE_MAX_ENTRIES` | Per-contract Greeks LRU capacity | `4096` |

## API Endpoints

### `POST /upload`
OCR screenshot parsing using Google Gemini.

**Response:**
```json
{ "positions": [{ "qty": -1, "expiration": "Jan 16", "strike": 150.0, "type": "C" }] }
```

### `POST /calculate`
P/L calculation with optional Black-Scholes pricing and Greeks.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `positions` | array | Yes | List of option positions |
| `credit` | float | Yes | Net credit/debit received |
| `symbol` | string | No | Stock symbol for Black-Scholes pricing |
| `use_theoretical_pricing` | bool | No | Use Black-Scholes (default: true) |
| `current_date` | string | No | Date for DTE calc (YYYY-MM-DD, default: today) |
| `skip_greeks_curve` | bool | No | Skip Greeks for faster response (default: false) |
| `eval_days_from_now` | int | No | Days from now to evaluate P/L |
| `precompute_dates` | bool | No | Pre-compute P/L for date slider (default: false) |

**Position Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `qty` | int | Yes | Quantity (positive=long, negative=short) |
| `strike` | float | Yes | Strike price |
| `type` | string | Yes | `"C"` for Call, `"P"` for Put |
| `expiration` | string | No | Expiration date (e.g., "Jan 16") |
| `style` | string | No | `"American"` or `"European"` (default: American) |
| `manual_price` | float | No | Override stock price |
| `manual_iv` | float | No | Override implied volatility |
| `dividend_yield` | float | No | Annual dividend yield (decimal) |

**Response:** P/L data points, Greeks, probability metrics, and market data.

### `GET /market-data/{symbol}`
Fetch current market data for a symbol.

**Response:**
```json
{
  "symbol": "AAPL",
  "current_price": 150.0,
  "implied_volatility": 0.25,
  "iv_rank": 45.0,
  "risk_free_rate": 0.045,
  "timestamp": "2024-01-15T10:30:00"
}
```

### `GET /symbols/search?q={query}`
Symbol autocomplete via Tastytrade API.

**Response:**
```json
{ "results": [{ "symbol": "AAPL", "name": "Apple Inc.", "type": "Stock" }] }
```

## Testing

```bash
uv run pytest
```
