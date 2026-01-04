# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands
**Always use `bun`, not `npm` for frontend package management.**
**Always use `uv`, not `pip` or anything else for backend python package management.**

### Frontend (React + Vite)
```bash
cd frontend
bun install              # Install dependencies
bun run dev              # Dev server at localhost:5173
bun run build            # Production build to /dist
bun run test             # Run Vitest tests
bun run test:watch       # Watch mode
bun run lint             # ESLint check
```

### Backend (FastAPI + Python)
```bash
cd backend
uv sync                                    # Install dependencies
uv run uvicorn main:app --reload --port 8000  # Dev server at localhost:8000
uv run pytest                              # Run all tests
uv run pytest test_black_scholes.py -v     # Run specific test file
uv run pytest -k "test_call"               # Run tests matching pattern
```

### Environment Setup
Backend requires `backend/.env`:
- `GEMINI_API_KEY` - Google Gemini API for OCR
- `TASTYTRADE_CLIENT_SECRET` and `TASTYTRADE_REFRESH_TOKEN` - for IV Rank and symbol search (optional, falls back to Yahoo Finance)

## Architecture

### High-Level Structure
```
frontend/          React SPA (Vite + TypeScript + TailwindCSS)
backend/           FastAPI Python service
```
The frontend proxies API calls to the backend during development (configured in `vite.config.js`). In production, the backend serves the built frontend as static files.

### Backend Core Modules

**main.py** - FastAPI app with endpoints:
- `POST /calculate` - P/L calculation with Greeks and probability metrics
- `POST /upload` - Screenshot OCR via Gemini AI
- `GET /market-data/{symbol}` - Current price, IV, IV Rank
- `GET /symbols/search` - Symbol autocomplete (Tastytrade)
- `GET /volatility-skew/{symbol}` - Per-strike IV data
- `GET /option-chain/{symbol}` - Available expirations/strikes

**calculator.py** - Options pricing engine:
- Black-Scholes for European options
- Binomial tree for American options
- Greeks calculation (delta, gamma, theta, vega, rho)
- Portfolio-level Greeks aggregation

**market_data.py** - Multi-source data fetching with caching:
- Yahoo Finance for stock prices
- Tastytrade for IV Rank and option chains
- 30-minute default cache duration

**tastytrade_client.py** - OAuth client for Tastytrade API

### Frontend Core Modules

**Hooks** (`src/hooks/`):
- `useCalculation.ts` - Position management, file upload, chart data
- `useMarketData.ts` - Symbol search, market data fetching
- `useVolatilitySkew.ts` - IV skew data fetching
- `useOptionChain.ts` - Option chain data

**Key Components**:
- `PLChart.tsx` - Recharts-based P/L visualization
- `GreeksChart.tsx` / `GreeksVisualization.tsx` - Greeks display (lazy-loaded)
- `SymbolAutocomplete.tsx` - Symbol search with API integration
- `VolatilitySkew/` - IV skew chart visualization

### Data Flow
1. User enters positions (manual or screenshot OCR)
2. Frontend fetches market data (price, IV) from backend
3. Backend calculates P/L curve across stock prices using Black-Scholes
4. Greeks computed per-position and aggregated for portfolio
5. Optional: precompute P/L at different future dates

## Testing
Frontend uses Vitest with jsdom environment. Backend uses pytest with asyncio.
Backend tests require dummy env vars (set in CI):
```bash
GOOGLE_API_KEY=test TASTYTRADE_CLIENT_SECRET=test TASTYTRADE_REFRESH_TOKEN=test uv run pytest
```

## Deployment
Docker multi-stage build: Bun builds frontend → Python serves static files + API. Deployed to Google Cloud Run via GitHub Actions (`.github/workflows/deploy.yml`).
