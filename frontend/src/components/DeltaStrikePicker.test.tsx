import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import DeltaStrikePicker from './DeltaStrikePicker';
import type { Position, SkewData } from '../types';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const skew: SkewData = {
  symbol: 'SPY',
  expiration: '2026-11-20',
  current_price: 100,
  atm_iv: 0.2,
  skew_metric: null,
  points: [
    { strike: 90, call_iv: 0.2, put_iv: 0.2, call_delta: 0.9, put_delta: -0.1 },
    { strike: 95, call_iv: 0.2, put_iv: 0.2, call_delta: 0.8, put_delta: -0.16 },
    { strike: 100, call_iv: 0.2, put_iv: 0.2, call_delta: 0.5, put_delta: -0.5 },
  ],
};

vi.mock('../hooks/useVolatilitySkew', () => ({ getSkewData: vi.fn(async () => skew) }));

function Harness() {
  const [positions, setPositions] = useState<Position[]>([
    { id: 'a', qty: -1, strike: 100, type: 'P', expiration: 'Nov 20 26' },
  ]);
  return (
    <>
      <DeltaStrikePicker symbol="SPY" positions={positions} setPositions={setPositions} />
      <button type="button" onClick={() => setPositions(prev => [{ ...prev[0], strike: 92 }])}>
        edit strike
      </button>
    </>
  );
}

describe('DeltaStrikePicker', () => {
  it('highlights the applied delta until a strike is edited by hand', async () => {
    render(<Harness />);
    const sixteen = screen.getByRole('button', { name: 'Move short strikes to 16 delta' });
    expect(sixteen).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(sixteen);
    await waitFor(() => expect(sixteen).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Move short strikes to 10 delta' }))
      .toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'edit strike' }));
    expect(sixteen).toHaveAttribute('aria-pressed', 'false');
  });
});
