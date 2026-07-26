import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const workflowState = vi.hoisted(() => ({
  symbol: '',
  marketData: null as {
    symbol: string;
    current_price: number;
    implied_volatility: number;
    iv_rank: number | null;
    risk_free_rate: number;
  } | null,
  loadingMarketData: false,
  positions: [] as Array<{
    id: string;
    qty: number;
    expiration: string;
    strike: number;
    type: 'C' | 'P';
  }>,
}));

vi.mock('./hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('./hooks/useMarketData', () => ({
  useMarketData: () => ({
    symbol: workflowState.symbol,
    setSymbol: vi.fn(),
    marketData: workflowState.marketData,
    setMarketData: vi.fn(),
    loadingMarketData: workflowState.loadingMarketData,
  }),
}));

vi.mock('./hooks/useCalculation', () => ({
  DEFAULT_EXPIRATION: 'Dec 18 26',
  generateId: () => 'generated-position',
  useCalculation: () => ({
    positions: workflowState.positions,
    setPositions: vi.fn(),
    credit: '',
    setCredit: vi.fn(),
    isDebit: false,
    setIsDebit: vi.fn(),
    chartData: [],
    loadingStates: { chart: false, greeks: false },
    loading: false,
    error: null,
    setError: vi.fn(),
    useTheoreticalPricing: true,
    setUseTheoreticalPricing: vi.fn(),
    showGreeks: false,
    setShowGreeks: vi.fn(),
    greeksData: null,
    portfolioGreeks: null,
    evalDaysFromNow: 0,
    setEvalDaysFromNow: vi.fn(),
    maxDaysToExpiration: null,
    precomputedDates: null,
    uploadResetKey: 0,
    handleFileSelect: vi.fn(),
    handleManualEntry: vi.fn(),
    handleStartOver: vi.fn(),
  }),
}));

vi.mock('./hooks/useChartZoom', () => ({
  useChartZoom: () => ({
    deferredZoomRange: { startIndex: 0, endIndex: 0 },
    chartContainerRef: { current: null },
    handleZoomIn: vi.fn(),
    handleZoomOut: vi.fn(),
    handleResetZoom: vi.fn(),
    handleChartMouseDown: vi.fn(),
    handleChartMouseMove: vi.fn(),
    handleChartMouseUp: vi.fn(),
    handleChartMouseLeave: vi.fn(),
    xAxisTicks: [],
  }),
}));

vi.mock('./components/VolatilitySkew/VolatilitySkewPanel', () => ({
  default: () => (
    <section aria-label="Volatility Skew">
      <h2>Volatility Skew</h2>
    </section>
  ),
}));

const matchingMarketData = {
  symbol: 'SPY',
  current_price: 600,
  implied_volatility: 0.2,
  iv_rank: 50,
  risk_free_rate: 0.04,
};

function expectDocumentOrder(first: Element, second: Element) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
}

describe('App volatility skew workflow', () => {
  beforeEach(() => {
    workflowState.symbol = 'SPY';
    workflowState.marketData = matchingMarketData;
    workflowState.loadingMarketData = false;
    workflowState.positions = [];

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        expirations: ['2026-12-18'],
        strikes_by_expiration: { '2026-12-18': [600] },
        underlying_price: 600,
      }),
    })));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete (window as Window & { loadMockData?: () => void }).loadMockData;
  });

  it('shows one volatility skew panel between Step 1 and Step 2 before positions are added', async () => {
    render(<App />);

    const skewPanel = await screen.findByRole('region', { name: 'Volatility Skew' });
    const stepOne = screen.getByRole('heading', { name: 'Choose the underlying' }).closest('section');
    const stepTwo = screen.getByRole('heading', { name: 'Capture the legs' }).closest('section');

    expect(screen.getAllByRole('region', { name: 'Volatility Skew' })).toHaveLength(1);
    expect(stepOne).not.toBeNull();
    expect(stepTwo).not.toBeNull();
    expectDocumentOrder(stepOne as HTMLElement, skewPanel);
    expectDocumentOrder(skewPanel, stepTwo as HTMLElement);
  });

  it('keeps exactly one volatility skew panel after positions are added', async () => {
    workflowState.positions = [
      {
        id: 'position-1',
        qty: -1,
        expiration: 'Dec 18 26',
        strike: 600,
        type: 'P',
      },
    ];

    render(<App />);

    expect(
      await screen.findAllByRole('region', { name: 'Volatility Skew' }),
    ).toHaveLength(1);
  });

  it('shows volatility skew even when IV Rank is unavailable', async () => {
    workflowState.marketData = { ...matchingMarketData, iv_rank: null };

    render(<App />);

    expect(
      await screen.findAllByRole('region', { name: 'Volatility Skew' }),
    ).toHaveLength(1);
  });

  it('does not show volatility skew while current-symbol market data is loading', () => {
    workflowState.loadingMarketData = true;

    render(<App />);

    expect(
      screen.queryByRole('region', { name: 'Volatility Skew' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['market data is unavailable', null],
    ['market data belongs to another symbol', { ...matchingMarketData, symbol: 'QQQ' }],
  ])('does not show volatility skew when %s', async (_scenario, marketData) => {
    workflowState.marketData = marketData;

    render(<App />);

    expect(
      screen.queryByRole('region', { name: 'Volatility Skew' }),
    ).not.toBeInTheDocument();
  });
});
