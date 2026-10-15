import { describe, expect, it } from 'vitest';
import type { Position, ScenarioLeg } from '../types';
import { blackScholesPrice, ivScenarioAdjustment } from './ivScenario';

const strangle: Position[] = [
  { id: 'p', qty: -1, expiration: 'Nov 20 26', strike: 95, type: 'P' },
  { id: 'c', qty: -1, expiration: 'Nov 20 26', strike: 105, type: 'C' },
];
const legs: ScenarioLeg[] = [
  { iv: 0.3, dte: 30, dividend_yield: 0 },
  { iv: 0.25, dte: 30, dividend_yield: 0 },
];

describe('blackScholesPrice', () => {
  it('matches textbook values', () => {
    expect(blackScholesPrice('C', 100, 100, 1, 0.05, 0, 0.2)).toBeCloseTo(10.4506, 3);
    expect(blackScholesPrice('P', 100, 100, 1, 0.05, 0, 0.2)).toBeCloseTo(5.5735, 3);
  });

  it('falls back to intrinsic value at expiration', () => {
    expect(blackScholesPrice('P', 90, 100, 0, 0.05, 0, 0.2)).toBe(10);
  });
});

describe('ivScenarioAdjustment', () => {
  const prices = [90, 100, 110];

  it('raises a short premium curve when IV falls', () => {
    const adjustment = ivScenarioAdjustment(prices, strangle, legs, 0, 0.045, 0, -0.3);
    expect(adjustment.every(value => value > 0)).toBe(true);
  });

  it('is zero without a change and once legs have expired', () => {
    expect(ivScenarioAdjustment(prices, strangle, legs, 0, 0.045, -0.3, -0.3)).toEqual([0, 0, 0]);
    expect(ivScenarioAdjustment(prices, strangle, legs, 30, 0.045, 0, -0.3)).toEqual([0, 0, 0]);
  });

  it('round-trips between shifts', () => {
    const down = ivScenarioAdjustment(prices, strangle, legs, 10, 0.045, 0, -0.5);
    const back = ivScenarioAdjustment(prices, strangle, legs, 10, 0.045, -0.5, 0);
    down.forEach((value, i) => expect(value + back[i]).toBeCloseTo(0, 8));
  });
});
