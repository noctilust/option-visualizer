# Option Visualizer

Visualize options positions and analyze P/L scenarios. Upload a screenshot or enter positions manually.

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env  # Add your API keys
uv sync && uv run uvicorn main:app --reload --port 8000

# Frontend
cd frontend
bun install && bun run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

**Backend** (`backend/.env`):
- `GEMINI_API_KEY` - Google Gemini API key for OCR
- `TASTYTRADE_CLIENT_SECRET` - Tastytrade OAuth client secret
- `TASTYTRADE_REFRESH_TOKEN` - Tastytrade OAuth refresh token

Optional:
- `DEFAULT_RISK_FREE_RATE` - Override default risk-free rate (default: 0.045)
- `DEFAULT_IMPLIED_VOLATILITY` - Override default IV (default: 0.25)
- `MARKET_DATA_CACHE_MINUTES` - Cache duration in minutes (default: 30)

## Features

- Screenshot OCR (Google Gemini AI)
- Interactive P/L charts with breakeven analysis
- Real-time market data (IV Rank from Tastytrade)
- Dark/light mode

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + Recharts
- **Backend**: FastAPI + Python
- **Data**: Tastytrade API (IV Rank), Yahoo Finance (prices)
