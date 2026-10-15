import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from concurrent.futures import ThreadPoolExecutor
from typing import List
from datetime import date, datetime
import image_parser
import calculator
from schemas import Position, CalculateRequest, CalculateResponse, MarketData
from market_data import MarketDataFetcher


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    from tastytrade_client import close_tastytrade_client
    from shared_cache import close_shared_cache

    close_tastytrade_client()
    close_shared_cache()


app = FastAPI(lifespan=lifespan)

# Initialize market data fetcher
cache_minutes = int(os.getenv('MARKET_DATA_CACHE_MINUTES', '30'))  # Cache for 30 minutes
market_data_fetcher = MarketDataFetcher(cache_duration_minutes=cache_minutes)

# CORS origins from environment variable, with sensible defaults for development
default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
origins = os.environ.get("CORS_ORIGINS", default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# Add GZip compression for responses > 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)



if os.path.exists(os.path.join(os.path.dirname(__file__), "static")):
    # In production, let the generic file server below handle the root
    pass
else:
    @app.get("/")
    def read_root():
        return {"message": "Option Visualizer API"}



@app.get("/symbols/search")
async def search_symbols(q: str = ""):
    """
    Search for stock/ETF symbols using Tastytrade API.
    
    Returns matching US stocks and ETFs.
    
    Args:
        q: Search query (e.g., 'AAPL' or 'Apple')
    
    Returns:
        List of matching symbols with name, exchange, and type
    """
    if not q or len(q) < 1:
        return {"results": []}
    
    try:
        from tastytrade_client import get_tastytrade_client
        
        tastytrade = get_tastytrade_client()
        results = tastytrade.search_symbols(q)
        return {"results": results}
        
    except Exception as e:
        print(f"Symbol search error: {e}")
        return {"results": []}

def _optional_lookup(fn, *args, default=None):
    try:
        return fn(*args)
    except Exception as e:
        print(f"Warning: optional market data lookup {fn.__name__} failed: {e}")
        return default


def build_market_data(symbol: str) -> dict:
    """Price, volatility and corporate-event data for an underlying."""
    stock_price = market_data_fetcher.get_stock_price(symbol)
    iv = market_data_fetcher.get_implied_volatility(symbol)

    with ThreadPoolExecutor(max_workers=6) as executor:
        risk_free_rate = executor.submit(market_data_fetcher.get_risk_free_rate)
        iv_rank = executor.submit(_optional_lookup, market_data_fetcher.calculate_iv_rank, symbol, iv)
        iv_percentile = executor.submit(_optional_lookup, market_data_fetcher.get_iv_percentile, symbol)
        historical_volatility = executor.submit(
            _optional_lookup, market_data_fetcher.calculate_historical_volatility, symbol
        )
        dividend_yield = executor.submit(
            _optional_lookup, market_data_fetcher.get_dividend_yield, symbol, default=0.0
        )
        earnings_date = executor.submit(_optional_lookup, market_data_fetcher.get_next_earnings_date, symbol)

    return {
        "symbol": symbol.upper(),
        "current_price": stock_price,
        "implied_volatility": iv,
        "iv_rank": iv_rank.result(),
        "iv_percentile": iv_percentile.result(),
        "historical_volatility": historical_volatility.result(),
        "dividend_yield": dividend_yield.result() or 0.0,
        "earnings_date": earnings_date.result(),
        "risk_free_rate": risk_free_rate.result(),
        "timestamp": datetime.now(),
    }


@app.get("/market-data/{symbol}")
def get_market_data(symbol: str):
    """
    Fetch current market data for a symbol

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Market data including price, IV, IV Rank/Percentile, HV, dividend yield,
        next earnings date and risk-free rate
    """
    try:
        market_data = build_market_data(symbol)
        market_data["timestamp"] = market_data["timestamp"].isoformat()
        return market_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch market data for {symbol}: {str(e)}"
        )

@app.get("/volatility-skew/{symbol}")
def get_volatility_skew(symbol: str, expiration: str):
    """
    Fetch volatility skew data for a specific symbol and expiration.

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL')
        expiration: Expiration date in YYYY-MM-DD format

    Returns:
        Volatility skew data including per-strike IV, ATM IV, and skew metric
    """
    try:
        from tastytrade_client import get_tastytrade_client

        # Validate expiration format
        try:
            from datetime import datetime
            datetime.strptime(expiration, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid expiration format: {expiration}. Use YYYY-MM-DD"
            )

        # Get current price for the symbol
        stock_price = market_data_fetcher.get_stock_price(symbol)

        # Fetch volatility skew data from Tastytrade
        tastytrade = get_tastytrade_client()
        if not tastytrade.is_enabled:
            raise HTTPException(
                status_code=503,
                detail="Tastytrade API is not configured. Please set TASTYTRADE_CLIENT_SECRET and TASTYTRADE_REFRESH_TOKEN environment variables."
            )

        skew_data = tastytrade.get_volatility_smile(
            symbol.upper(),
            expiration,
            stock_price
        )

        return {
            "data": {
                "symbol": symbol.upper(),
                "expiration": expiration,
                "current_price": stock_price,
                "atm_iv": skew_data["atm_iv"],
                "data_status": skew_data.get("data_status", "ok"),
                "skew_metric": skew_data["skew_metric"],
                "skew_basis": skew_data.get("skew_basis", "unavailable"),
                "call_selection": skew_data.get("call_selection"),
                "put_selection": skew_data.get("put_selection"),
                "points": skew_data["points"]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch volatility skew for {symbol}: {str(e)}"
        )

@app.get("/option-chain/{symbol}")
def get_option_chain(symbol: str):
    """
    Fetch option chain data (expirations and strikes) for a symbol.

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Available expirations and strikes for each expiration
    """
    try:
        from tastytrade_client import get_tastytrade_client

        tastytrade = get_tastytrade_client()
        if not tastytrade.is_enabled:
            raise HTTPException(
                status_code=503,
                detail="Tastytrade API is not configured. Please set TASTYTRADE_CLIENT_SECRET and TASTYTRADE_REFRESH_TOKEN environment variables."
            )

        chain_data = tastytrade.get_option_chain(symbol.upper())

        return {
            "expirations": chain_data["expirations"],
            "strikes_by_expiration": chain_data["strikes_by_expiration"],
            "underlying_price": chain_data.get("underlying_price")
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch option chain for {symbol}: {str(e)}"
        )

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        positions = image_parser.parse_screenshot(contents)
        return {"positions": positions}
    except image_parser.InvalidImageError as e:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a readable image",
        ) from e
    except image_parser.OCRConfigurationError as e:
        raise HTTPException(
            status_code=503,
            detail="Position recognition is not configured",
        ) from e
    except image_parser.OCRProcessingError as e:
        raise HTTPException(
            status_code=502,
            detail="Position recognition is temporarily unavailable",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Image upload failed") from e

@app.post("/calculate")
def calculate_pl(request: CalculateRequest):
    """
    Calculate P/L for options positions with optional Black-Scholes pricing

    If symbol is provided, fetches market data and calculates theoretical pricing and Greeks.
    Otherwise, falls back to intrinsic value calculation (backward compatible).
    """
    try:
        # Convert Pydantic models to dicts for the calculator
        positions_dicts = [p.model_dump() for p in request.positions]

        # Fetch market data if symbol is provided
        market_data = None
        if request.symbol:
            try:
                market_data = build_market_data(request.symbol)
            except Exception as e:
                # If market data fetch fails, log but continue with intrinsic value
                print(f"Warning: Could not fetch market data for {request.symbol}: {e}")
                market_data = None

        # Determine current date for DTE calculation
        current_date = None
        if request.current_date:
            try:
                current_date = date.fromisoformat(request.current_date)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid date format: {request.current_date}. Use YYYY-MM-DD"
                )
        else:
            current_date = date.today()

        # Calculate P/L with new calculator interface
        result = calculator.calculate_pl(
            positions_dicts,
            request.credit,
            market_data=market_data,
            current_date=current_date,
            use_theoretical_pricing=request.use_theoretical_pricing,
            skip_greeks_curve=request.skip_greeks_curve,
            eval_days_from_now=request.eval_days_from_now,
            precompute_dates=request.precompute_dates,
            iv_shift=request.iv_shift,
            profit_target_pct=request.profit_target_pct,
        )

        # Return result (backward compatible: if no market data, returns simple format)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Serve static files (Production)
# This assumes the frontend build is copied to 'static' directory
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

static_path = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(static_path):
    # Mount assets
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")

    # Catch-all for SPA
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Safe-guard: if the path starts with api/ (though generic here), ignore? 
        # Actually API routes match first.
        
        file_path = os.path.join(static_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        return FileResponse(os.path.join(static_path, "index.html"))
