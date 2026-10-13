import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExpirationDropdown from './ExpirationDropdown';

const FIXED_NOW = new Date(2026, 6, 25, 12);

function optionChainResponse(expirations: string[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      expirations,
      strikes_by_expiration: {},
      underlying_price: 600,
    }),
  } as Response;
}

function optionChainErrorResponse(): Response {
  return {
    ok: false,
    status: 503,
    json: async () => ({ detail: 'Option chain unavailable' }),
  } as Response;
}

describe('ExpirationDropdown monthly auto-selection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for the option chain and selects the next monthly after earlier weeklies', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const pendingResponse = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    const onChange = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={onChange}
        autoSelectNextMonthly
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/option-chain/SPY',
      expect.objectContaining({ method: 'GET' }),
    ));
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch(optionChainResponse([
        '2026-08-07',
        '2026-08-14',
        '2026-08-21',
        '2026-09-18',
      ]));
      await pendingResponse;
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-08-21'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing expiration instead of replacing it with a monthly', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => optionChainResponse([
        '2026-08-07',
        '2026-08-21',
        '2027-08-20',
      ])),
    );

    render(
      <ExpirationDropdown
        symbol="SPY"
        value="2026-08-07"
        onChange={onChange}
        autoSelectNextMonthly
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Aug 20 • \d+d/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not auto-select when the opt-in prop is omitted', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => optionChainResponse([
        '2026-08-07',
        '2026-08-21',
        '2027-08-20',
      ])),
    );

    render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Aug 20 • \d+d/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports whether expirations came from the live chain or fallback data', async () => {
    const liveExpirations = [
      '2026-08-07',
      '2026-08-21',
      '2026-09-18',
    ];
    const onLiveResolved = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => optionChainResponse(liveExpirations)),
    );

    const { unmount } = render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={vi.fn()}
        onExpirationsResolved={onLiveResolved}
      />,
    );

    await waitFor(() => expect(onLiveResolved).toHaveBeenCalledWith(
      liveExpirations,
      'api',
    ));
    unmount();

    const onFallbackResolved = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => optionChainResponse([])),
    );

    render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={vi.fn()}
        onExpirationsResolved={onFallbackResolved}
      />,
    );

    await waitFor(() => expect(onFallbackResolved).toHaveBeenCalledWith(
      expect.arrayContaining(['2026-08-21']),
      'fallback',
    ));
  });

  it.each([
    ['an empty option chain', optionChainResponse([])],
    ['an option-chain error', optionChainErrorResponse()],
  ])('uses the generated next monthly after %s', async (_scenario, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => response));

    render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={onChange}
        autoSelectNextMonthly
      />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-08-21'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not invent a monthly when a successful option chain only has weeklies', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => optionChainResponse([
        '2027-08-06',
        '2027-08-13',
      ])),
    );

    render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={onChange}
        autoSelectNextMonthly
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Aug 6 • \d+d/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a late option chain response for the previous symbol', async () => {
    let resolveSpy: (response: Response) => void = () => {};
    const spyResponse = new Promise<Response>(resolve => {
      resolveSpy = resolve;
    });
    const qqqExpirations = ['2026-08-21', '2026-09-18'];
    const onExpirationsResolved = vi.fn();

    vi.stubGlobal('fetch', vi.fn((url: string) => (
      url.endsWith('/SPY')
        ? spyResponse
        : Promise.resolve(optionChainResponse(qqqExpirations))
    )));

    const { rerender } = render(
      <ExpirationDropdown
        symbol="SPY"
        value=""
        onChange={vi.fn()}
        onExpirationsResolved={onExpirationsResolved}
      />,
    );

    rerender(
      <ExpirationDropdown
        symbol="QQQ"
        value=""
        onChange={vi.fn()}
        onExpirationsResolved={onExpirationsResolved}
      />,
    );

    await waitFor(() => expect(onExpirationsResolved).toHaveBeenCalledWith(
      qqqExpirations,
      'api',
    ));

    await act(async () => {
      resolveSpy(optionChainResponse(['2026-10-16']));
      await spyResponse;
    });

    expect(onExpirationsResolved).not.toHaveBeenCalledWith(
      ['2026-10-16'],
      'api',
    );
  });
});

describe('ExpirationDropdown monthly filter', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('filters live expirations, preserves the selection, and restores weeklies when disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => optionChainResponse([
      '2026-08-07', '2026-08-21', '2026-09-18',
    ])));
    const onChange = vi.fn();
    const onPreviewChange = vi.fn();
    render(
      <ExpirationDropdown symbol="SPY" value="2026-08-07" onChange={onChange}
        onPreviewChange={onPreviewChange} showMonthlyFilter />,
    );
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('option', { name: /Aug 7/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));
    expect(screen.queryByRole('option', { name: /Aug 7/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));
    expect(screen.getByRole('option', { name: /Aug 7/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));
    fireEvent.click(screen.getByRole('option', { name: /Aug 21/ }));
    expect(onChange).toHaveBeenCalledWith('2026-08-21');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('checkbox', { name: 'Monthly only' })).toBeChecked();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('shows an empty state when the live chain has only weeklies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => optionChainResponse(['2026-08-07'])));
    render(<ExpirationDropdown symbol="SPY" value="2026-08-07" onChange={vi.fn()} showMonthlyFilter />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('option', { name: /Aug 7/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('No monthly expirations available.');
  });

  it('remembers both enabling and disabling the filter when switching underlying remounts the picker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => optionChainResponse([
      '2026-08-07', '2026-08-21',
    ])));
    const { rerender } = render(
      <ExpirationDropdown key="SPY" symbol="SPY" value="2026-08-21" onChange={vi.fn()} showMonthlyFilter />,
    );
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('option', { name: /Aug 7/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));

    rerender(<ExpirationDropdown key="QQQ" symbol="QQQ" value="2026-08-21" onChange={vi.fn()} showMonthlyFilter />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('option', { name: /Aug 21/ });
    expect(screen.getByRole('checkbox', { name: 'Monthly only' })).toBeChecked();
    expect(screen.queryByRole('option', { name: /Aug 7/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));

    rerender(<ExpirationDropdown key="SPY" symbol="SPY" value="2026-08-21" onChange={vi.fn()} showMonthlyFilter />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('option', { name: /Aug 7/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Monthly only' })).not.toBeChecked();
  });

  it('filters generated fallback dates including a custom weekly selection', () => {
    render(<ExpirationDropdown value="2026-08-05" onChange={vi.fn()} showMonthlyFilter />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('option', { name: /Aug 5/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monthly only' }));
    expect(screen.queryByRole('option', { name: /Aug 5/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Aug 21/ })).toBeInTheDocument();
    expect(screen.queryAllByText('W')).toHaveLength(1); // Current selection remains visible in the trigger.
  });
});

describe('ExpirationDropdown hover preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderPreviewDropdown() {
    const onChange = vi.fn();
    const onPreviewChange = vi.fn();

    render(
      <ExpirationDropdown
        value="2026-08-21"
        onChange={onChange}
        onPreviewChange={onPreviewChange}
      />,
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    return {
      onChange,
      onPreviewChange,
      option: screen.getByRole('option', { name: /Sep 18/ }),
    };
  }

  it('previews a hovered expiration after the delay without committing it', () => {
    const { onChange, onPreviewChange, option } = renderPreviewDropdown();

    fireEvent.mouseEnter(option);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onPreviewChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPreviewChange).toHaveBeenCalledWith('2026-09-18');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the hover preview when the cursor leaves the expiration menu', () => {
    const { onChange, onPreviewChange, option } = renderPreviewDropdown();

    fireEvent.mouseEnter(option);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.mouseLeave(screen.getByRole('listbox', { name: 'Expiration cycles' }));

    expect(onPreviewChange.mock.calls).toEqual([
      ['2026-09-18'],
      [null],
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits a clicked expiration, clears its pending preview, and closes the menu', () => {
    const { onChange, onPreviewChange, option } = renderPreviewDropdown();

    fireEvent.mouseEnter(option);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith('2026-09-18');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onPreviewChange).toHaveBeenCalledTimes(1);
    expect(onPreviewChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('listbox', { name: 'Expiration cycles' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onPreviewChange).toHaveBeenCalledTimes(1);
  });
});
