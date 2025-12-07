# Option Visualizer Frontend

React frontend for the Option Visualizer application. Built with Vite, TailwindCSS, and Recharts.

## Prerequisites

- Node.js 18+
- npm or yarn

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Create a `.env` file to configure the API URL:

```bash
VITE_API_URL=http://localhost:8000
```

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000` |

## Development

Start the development server with hot reload:

```bash
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

## Project Structure

```
frontend/
├── src/
│   ├── App.jsx                # Main application component
│   ├── main.jsx               # React entry point
│   ├── index.css              # Global styles
│   └── components/
│       ├── UploadSection.jsx      # File upload & OCR UI
│       ├── InputSection.jsx       # Credit/debit input form
│       ├── PositionsTable.jsx     # Editable positions table
│       └── PositionsTable.test.jsx
├── public/                    # Static assets
├── package.json               # Dependencies & scripts
├── vite.config.js             # Vite configuration
├── tailwind.config.js         # TailwindCSS configuration
└── eslint.config.js           # ESLint configuration
```

## Features

- **Screenshot Upload**: Drag & drop or click to upload options screenshots
- **OCR Parsing**: Automatic position extraction using backend OCR
- **Manual Entry**: Add and edit positions manually
- **Interactive Charts**: Zoom, pan, and hover for P/L details
- **Breakeven Snapping**: Magnetic cursor snapping to breakeven points
- **Theme Toggle**: Dark and light mode support
- **Responsive Design**: Works on desktop and mobile

## Tech Stack

- **React 19** - UI framework
- **Vite 7** - Build tool with HMR
- **TailwindCSS 4** - Utility-first CSS
- **Recharts 3** - Charting library
- **Lucide React** - Icon library
- **Vitest** - Test runner
- **React Testing Library** - Component testing
