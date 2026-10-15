import type { Position, ScenarioLeg } from '../types';

const SHARES_PER_CONTRACT = 100;
const MIN_IV = 0.01;

// Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function blackScholesPrice(
  type: 'C' | 'P',
  spot: number,
  strike: number,
  years: number,
  rate: number,
  dividendYield: number,
  volatility: number,
): number {
  if (years <= 0 || volatility <= 0 || spot <= 0 || strike <= 0) {
    return Math.max(0, type === 'C' ? spot - strike : strike - spot);
  }
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + volatility * volatility / 2) * years) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;
  const spotPv = spot * Math.exp(-dividendYield * years);
  const strikePv = strike * Math.exp(-rate * years);
  return type === 'C'
    ? spotPv * normCdf(d1) - strikePv * normCdf(d2)
    : strikePv * normCdf(-d2) - spotPv * normCdf(-d1);
}

/**
 * Change in position P/L at each price when every leg's IV moves from
 * `fromShift` to `toShift` (fractions, e.g. -0.3), `daysFromNow` days ahead.
 * Added to the server curve computed at `fromShift`, this previews the
 * `toShift` curve without a round trip; European pricing is close enough for
 * the difference even when the server prices American legs.
 */
export function ivScenarioAdjustment(
  prices: number[],
  positions: Position[],
  legs: ScenarioLeg[],
  daysFromNow: number,
  rate: number,
  fromShift: number,
  toShift: number,
): number[] {
  const adjustment = new Array<number>(prices.length).fill(0);
  if (fromShift === toShift || legs.length !== positions.length) return adjustment;

  positions.forEach((pos, idx) => {
    const leg = legs[idx];
    const years = Math.max(0, leg.dte - daysFromNow) / 365;
    if (years <= 0) return;
    const fromIv = Math.max(MIN_IV, leg.iv * (1 + fromShift));
    const toIv = Math.max(MIN_IV, leg.iv * (1 + toShift));
    const scale = pos.qty * SHARES_PER_CONTRACT;
    for (let i = 0; i < prices.length; i++) {
      const before = blackScholesPrice(pos.type, prices[i], pos.strike, years, rate, leg.dividend_yield, fromIv);
      const after = blackScholesPrice(pos.type, prices[i], pos.strike, years, rate, leg.dividend_yield, toIv);
      adjustment[i] += scale * (after - before);
    }
  });
  return adjustment;
}
