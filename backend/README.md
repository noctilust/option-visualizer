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
| `GOOGLE_API_KEY` | Google AI API key for OCR |
| `TASTYTRADE_CLIENT_SECRET` | Tastytrade OAuth client secret |
| `TASTYTRADE_REFRESH_TOKEN` | Tastytrade OAuth refresh token |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | OCR screenshot parsing |
| POST | `/calculate` | P/L calculation |
| GET | `/market-data/{symbol}` | Stock price, IV, IV Rank |
| GET | `/symbols/search?q=` | Symbol autocomplete |

## Testing

```bash
uv run pytest
```
