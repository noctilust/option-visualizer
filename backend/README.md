# Option Visualizer Backend

FastAPI backend for the Option Visualizer application. Provides OCR functionality for parsing options screenshots and P/L calculation.

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- [Google AI API Key](https://makersuite.google.com/app/apikey) for OCR

## Setup

### 1. Install Dependencies

```bash
uv sync
```

### 2. Configure Environment

Create a `.env` file (or copy from `.env.example`):

```bash
GOOGLE_API_KEY=your_api_key_here
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google AI API key for Gemini OCR | Required |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173,http://localhost:3000` |

## Running the Server

### Development

```bash
uv run uvicorn main:app --reload --port 8000
```

The server will be available at [http://localhost:8000](http://localhost:8000).

### Production

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

### `GET /`
Health check endpoint.

**Response:**
```json
{"message": "Option Visualizer API"}
```

### `POST /upload`
Upload an options screenshot for OCR parsing.

**Request:** `multipart/form-data` with `file` field containing the image.

**Response:**
```json
{
  "positions": [
    {
      "strike": 100.0,
      "quantity": 1,
      "option_type": "call"
    }
  ]
}
```

### `POST /calculate`
Calculate P/L data for a set of positions.

**Request:**
```json
{
  "positions": [
    {
      "strike": 100.0,
      "quantity": 1,
      "option_type": "call"
    }
  ],
  "credit": 2.50
}
```

**Response:**
```json
{
  "data": [
    {"price": 90, "pl": -250},
    {"price": 95, "pl": -250},
    ...
  ]
}
```

## Testing

Run the test suite:

```bash
uv run pytest
```

Run with verbose output:

```bash
uv run pytest -v
```

## Project Structure

```
backend/
├── main.py          # FastAPI application & routes
├── ocr.py           # Google Gemini OCR integration
├── calculator.py    # P/L calculation logic
├── schemas.py       # Pydantic request/response models
├── test_main.py     # API endpoint tests
├── test_schemas.py  # Schema validation tests
├── pyproject.toml   # Project dependencies
└── .env             # Environment variables (not in git)
```

## Docker

Build and run with Docker:

```bash
docker build -t option-visualizer-backend .
docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key option-visualizer-backend
```
