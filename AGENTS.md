# AGENTS.md

This file provides guidance to AI coding agents (Codex, Cursor, and others that read AGENTS.md) when working with code in this repository.

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
bun run typecheck        # tsc --noEmit
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

### Before Committing
CI (`.github/workflows/deploy.yml`) runs, and fails on, all of:
```bash
cd frontend && bun run lint && bun run typecheck && bun run test && bun run build
cd backend && uv run pytest
```

### Environment Setup
Backend reads `backend/.env` (template: `backend/.env.example`):
- `GEMINI_API_KEY` - Google Gemini API for screenshot OCR
- `TASTYTRADE_CLIENT_SECRET` and `TASTYTRADE_REFRESH_TOKEN` - IV Rank/Percentile, symbol search, option chains, per-strike IV and quotes (optional; falls back to Yahoo Finance where possible)
- `VALKEY_*` - optional shared cache (Memorystore in production); the app fails open to in-process caching when unset

See `backend/README.md` for the full list of optional tuning variables.

Frontend reads `VITE_API_URL`: `frontend/.env.development` points it at `http://127.0.0.1:8000`, so in dev the browser calls the backend directly (CORS allows localhost). `frontend/.env.production` leaves it empty for same-origin requests. The proxy in `vite.config.js` only covers `/upload` and `/calculate`.

## Architecture

### High-Level Structure
```
frontend/          React 19 SPA (Vite + TypeScript + Tailwind v4 + Recharts)
backend/           FastAPI Python service
Dockerfile         Multi-stage production build
```
In production, the backend serves the built frontend as static files.

### Backend Core Modules

**main.py** - FastAPI app with endpoints:
- `POST /calculate` - P/L curve, Greeks, probability and seller metrics; accepts `iv_shift` and `profit_target_pct`
- `POST /upload` - Screenshot OCR via Gemini AI
- `GET /market-data/{symbol}` - Price, IV, IV Rank/Percentile, historical volatility, dividend yield, next earnings date, risk-free rate
- `GET /symbols/search` - Symbol autocomplete (Tastytrade)
- `GET /volatility-skew/{symbol}` - Per-strike IV data
- `GET /option-chain/{symbol}` - Available expirations/strikes

`build_market_data` is shared by `/market-data` and `/calculate`; optional lookups run in parallel and degrade to `None`/0 on failure.

**calculator.py** - Options pricing engine:
- Black-Scholes for European options, binomial tree for American options
- Greeks calculation (delta, gamma, theta, vega, rho) and portfolio aggregation
- IV shift scenarios; returns `scenario_legs` (unshifted per-leg IV, DTE, dividend yield) so the frontend can preview IV changes locally

**seller_metrics.py** - Premium-seller analytics: expiration P/L, max profit/loss, breakevens, probability of profit, short-strike ITM/touch probabilities, expected move, Monte Carlo profit-target probability, Reg-T buying power estimate, mid/natural credit from quotes

**market_data.py** - Multi-source data fetching with caching:
- Yahoo Finance for prices, historical volatility, dividends and earnings dates (index symbols like SPX map to `^SPX`)
- Tastytrade for IV Rank/Percentile and option chains
- 30-minute default cache; corporate events cached for 12 hours

**shared_cache.py** - Optional Valkey-backed cache shared across Cloud Run instances

**tastytrade_client.py** - OAuth client for Tastytrade API, with rate limiting and caching

**image_parser.py** - Gemini OCR for broker screenshots; **schemas.py** - Pydantic request/response models

### Frontend Core Modules

**Hooks** (`src/hooks/`):
- `useCalculation.ts` - Position management, file upload, calculation requests, IV scenario state
- `useChartZoom.ts` - Zoom/pan state for the P/L and Greeks charts, default framing around strikes and breakevens
- `useMarketData.ts` - Market data fetching
- `useVolatilitySkew.ts` - IV skew data fetching
- `useOptionChain.ts` - Option chain data

**Key Components**:
- `PLChart.tsx` - Recharts-based P/L visualization; `PLChartMarkers.tsx` draws grid, strikes, spot and breakevens; `plChartData.ts` holds pure chart math (ticks, breakevens, domains)
- `SellerMetricsPanel.tsx` - PoP, max profit/loss, buying power, return on capital, short-strike risk
- `DeltaStrikePicker.tsx` - Move short strikes to a target delta
- `IvScenarioControl.tsx` / `DateSelector.tsx` - IV scenario and P/L date controls
- `GreeksChart.tsx` / `GreeksVisualization.tsx` - Greeks display (lazy-loaded)
- `SymbolAutocomplete.tsx` - Symbol search with API integration
- `VolatilitySkew/` - IV skew chart visualization

**Utils** (`src/utils/`): `store.ts` (minimal external store), `ivScenario.ts` (client-side Black-Scholes for IV previews), `deltaStrikes.ts`, `expiration.ts`, `format.ts`

### Data Flow
1. User enters positions (manual or screenshot OCR)
2. Frontend fetches market data (price, IV, events) from backend
3. Backend calculates the P/L curve across stock prices, Greeks, and seller metrics
4. P/L at future dates is precomputed or interpolated for the date slider
5. While the IV slider moves, the frontend adjusts the curve locally with Black-Scholes; the backend recalculates when it is released

## Frontend Conventions
- **Fast-changing UI state** (zoom range, IV slider preview) lives in a `Store` from `src/utils/store.ts`, read via `useStore`, so only the components that draw it re-render, not `App`. Keep chart interactions off React state in `App`.
- **Lint** uses `eslint-plugin-react-hooks` v7: no `setState` inside effects and no ref writes during render. Derive values during render or sync refs in effects.
- **Selected/pressed buttons** use `aria-pressed` with the shared `.segmented-item` style in `index.css` (or Tailwind `aria-pressed:` variants) so highlighting looks the same everywhere.
- **Tests** sit next to the code as `*.test.ts(x)`; setup is in `src/test/setup.ts`.

## Testing
Frontend uses Vitest with jsdom environment. Backend uses pytest.
Backend tests require dummy env vars (set in CI):
```bash
GEMINI_API_KEY=test TASTYTRADE_CLIENT_SECRET=test TASTYTRADE_REFRESH_TOKEN=test uv run pytest
```
Valkey integration tests run only when `TEST_VALKEY_HOST`/`TEST_VALKEY_PORT` are set.

## Deployment
Docker multi-stage build (root `Dockerfile`): Bun builds frontend → Python serves static files + API. Deployed to Google Cloud Run via GitHub Actions (`.github/workflows/deploy.yml`); `provision-shared-cache.yml` provisions the Valkey cache.
