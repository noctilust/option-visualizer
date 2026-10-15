import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InputSection from './InputSection';

describe('InputSection market credit', () => {
  it('fills the credit from the market mid and flags a wide spread', () => {
    const setCredit = vi.fn();
    const setIsDebit = vi.fn();
    render(
      <InputSection
        credit=""
        setCredit={setCredit}
        isDebit={false}
        setIsDebit={setIsDebit}
        marketCredit={{ mid: 110, natural: 90, bid_ask_width: 40, spread_pct: 36.4 }}
      />,
    );

    expect(screen.getByTestId('market-credit')).toHaveTextContent('wide, expect slippage');
    fireEvent.click(screen.getByRole('button', { name: 'Use mid' }));
    expect(setCredit).toHaveBeenCalledWith('110.00');
    expect(setIsDebit).toHaveBeenCalledWith(false);
  });

  it('treats a negative market net as a debit', () => {
    const setCredit = vi.fn();
    const setIsDebit = vi.fn();
    render(
      <InputSection
        credit=""
        setCredit={setCredit}
        isDebit={false}
        setIsDebit={setIsDebit}
        marketCredit={{ mid: -250, natural: -270, bid_ask_width: 20, spread_pct: 8 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use natural' }));
    expect(setCredit).toHaveBeenCalledWith('270.00');
    expect(setIsDebit).toHaveBeenCalledWith(true);
  });

  it('highlights the market price that matches the entered amount', () => {
    const quotes = { mid: -250, natural: -270, bid_ask_width: 20, spread_pct: 8 };
    const { rerender } = render(
      <InputSection credit="270.00" setCredit={() => {}} isDebit setIsDebit={() => {}} marketCredit={quotes} />,
    );
    expect(screen.getByRole('button', { name: 'Use natural' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Use mid' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<InputSection credit="265" setCredit={() => {}} isDebit setIsDebit={() => {}} marketCredit={quotes} />);
    expect(screen.getByRole('button', { name: 'Use natural' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Use mid' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the market hint without quotes', () => {
    render(<InputSection credit="" setCredit={() => {}} isDebit={false} setIsDebit={() => {}} />);
    expect(screen.queryByTestId('market-credit')).not.toBeInTheDocument();
  });
});
