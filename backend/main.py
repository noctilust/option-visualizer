import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import date, datetime
import image_parser
import calculator
from schemas import Position, CalculateRequest, CalculateResponse, MarketData
from market_data import MarketDataFetcher

app = FastAPI()

# Initialize market data fetcher
cache_minutes = int(os.getenv('MARKET_DATA_CACHE_MINUTES', '10'))
market_data_fetcher = MarketDataFetcher(cache_duration_minutes=cache_minutes)

# CORS origins from environment variable, with sensible defaults for development
default_origins = "http://localhost:5173,http://localhost:3000"
origins = os.environ.get("CORS_ORIGINS", default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)



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

@app.get("/market-data/{symbol}")
async def get_market_data(symbol: str):
    """
    Fetch current market data for a symbol

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Market data including current price, implied volatility, and risk-free rate
    """
    try:
        stock_price = market_data_fetcher.get_stock_price(symbol)

        # Get implied volatility (will use HV as fallback)
        iv = market_data_fetcher.get_implied_volatility(symbol)

        # Get risk-free rate
        risk_free_rate = market_data_fetcher.get_risk_free_rate()
        
        # Calculate IV Rank
        iv_rank = market_data_fetcher.calculate_iv_rank(symbol, iv)

        return {
            "symbol": symbol.upper(),
            "current_price": stock_price,
            "implied_volatility": iv,
            "iv_rank": iv_rank,
            "risk_free_rate": risk_free_rate,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch market data for {symbol}: {str(e)}"
        )

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        positions = image_parser.parse_screenshot(contents)
        if not positions:
            positions = []
        return {"positions": positions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
                # Get market data for Black-Scholes calculation
                stock_price = market_data_fetcher.get_stock_price(request.symbol)
                iv = market_data_fetcher.get_implied_volatility(request.symbol)
                risk_free_rate = market_data_fetcher.get_risk_free_rate()

                market_data = {
                    'symbol': request.symbol.upper(),
                    'current_price': stock_price,
                    'implied_volatility': iv,
                    'iv_rank': market_data_fetcher.calculate_iv_rank(request.symbol, iv),
                    'risk_free_rate': risk_free_rate,
                    'timestamp': datetime.now()
                }
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
            use_theoretical_pricing=request.use_theoretical_pricing
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
