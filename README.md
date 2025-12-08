# Option Visualizer

A web application for visualizing options positions and analyzing profit/loss scenarios. Upload a screenshot of your options positions or enter them manually to see interactive P/L charts.

![Option Visualizer](TSLA.png)

## Features

- **Screenshot OCR**: Upload screenshots of options positions and automatically extract position data using Google's Gemini AI
- **Manual Entry**: Enter positions manually with a user-friendly form (expiration date is optional)
- **Interactive P/L Charts**: Visualize profit/loss across different stock prices with Recharts
- **Breakeven Analysis**: See exact breakeven points with magnetic cursor snapping
- **Dark/Light Mode**: Toggle between themes for comfortable viewing
- **Zoom Controls**: Zoom in/out on specific price ranges

## Tech Stack

- **Frontend**: React 19 + Vite + TailwindCSS + Recharts
- **Backend**: FastAPI + Python 3.12+
- **OCR**: Google Gemini AI
- **Testing**: Vitest (frontend) + Pytest (backend)

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://python.org/) (3.12+)
- [uv](https://docs.astral.sh/uv/) - Fast Python package manager
- [Google AI API Key](https://makersuite.google.com/app/apikey) for OCR functionality

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/noctilust/option-visualizer.git
cd option-visualizer
```

### 2. Set Up the Backend

```bash
cd backend

# Copy environment template and add your API key
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

# Install dependencies and start server
uv sync
uv run uvicorn main:app --reload --port 8000
```

### 3. Set Up the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Open the App

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
option-visualizer/
├── backend/                 # FastAPI Python backend
│   ├── main.py             # API endpoints
│   ├── ocr.py              # Google Gemini OCR integration
│   ├── calculator.py       # P/L calculation logic
│   ├── schemas.py          # Pydantic models
│   └── test_*.py           # Backend tests
├── frontend/               # React Vite frontend
│   └── src/
│       ├── App.jsx         # Main application component
│       └── components/     # React components
│           ├── UploadSection.jsx      # File upload & OCR
│           ├── InputSection.jsx       # Credit/debit input
│           └── PositionsTable.jsx     # Positions editing
└── README.md               # This file
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_API_KEY` | Google AI API key for OCR | Yes |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | No (defaults to localhost) |

### Frontend (`frontend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend API URL | No (defaults to `http://localhost:8000`) |

## Running Tests

### Backend Tests

```bash
cd backend
uv run pytest
```

### Frontend Tests

```bash
cd frontend
npm test
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/upload` | Upload screenshot for OCR parsing |
| POST | `/calculate` | Calculate P/L data for positions |

## License

MIT License - See [LICENSE](LICENSE) for details.
