import { describe, expect, it } from 'vitest';
import type { Position, SkewDataPoint } from '../types';
import { retargetShortStrikes } from './deltaStrikes';

const EXP = 'Nov 20 26';

function point(strike: number, callDelta: number, putDelta: number): SkewDataPoint {
  return { strike, call_iv: 0.3, put_iv: 0.3, call_delta: callDelta, put_delta: putDelta };
}

const POINTS: SkewDataPoint[] = [
  point(85, 0.95, -0.05),
  point(90, 0.9, -0.1),
  point(95, 0.8, -0.16),
  point(100, 0.5, -0.5),
  point(105, 0.2, -0.8),
  point(110, 0.15, -0.85),
  point(115, 0.08, -0.92),
];

function leg(id: string, qty: number, strike: number, type: 'C' | 'P'): Position {
  return { id, qty, strike, type, expiration: EXP };
}

describe('retargetShortStrikes', () => {
  it('moves short legs to the closest delta and shifts wings by the same amount', () => {
    const condor = [
      leg('a', 1, 90, 'P'),
      leg('b', -1, 95, 'P'),
      leg('c', -1, 100, 'C'),
      leg('d', 1, 105, 'C'),
    ];

    const { positions, changed } = retargetShortStrikes(condor, { [EXP]: POINTS }, 0.16);

    expect(positions.map(p => p.strike)).toEqual([90, 95, 110, 115]);
    expect(changed).toBe(2);
  });

  it('snaps shifted long legs to listed strikes and leaves other expirations alone', () => {
    const other = { ...leg('z', -1, 100, 'P'), expiration: 'Dec 18 26' };
    const spread = [leg('a', -1, 100, 'P'), leg('b', 1, 97, 'P'), other];

    const { positions } = retargetShortStrikes(spread, { [EXP]: POINTS }, 0.1);

    expect(positions[0].strike).toBe(90);
    expect(positions[1].strike).toBe(85); // 97 - 10 = 87 -> nearest listed 85
    expect(positions[2]).toBe(other);
  });
});
