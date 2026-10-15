"""
Risk and return metrics aimed at option premium sellers.

All P/L figures are in dollars for the whole position (100 shares per
contract); `credit` is the net amount received (negative for a debit).
Probabilities assume a lognormal terminal price with risk-neutral drift.
"""

import math
from typing import Dict, List, Optional, Sequence

import numpy as np
from scipy.stats import norm

SHARES_PER_CONTRACT = 100

# Reg-T style naked option requirement rates
NAKED_UNDERLYING_RATE = 0.20
NAKED_MINIMUM_RATE = 0.10


def _intrinsic(option_type: str, price: float, strike: float) -> float:
    if option_type.upper() == 'C':
        return max(0.0, price - strike)
    return max(0.0, strike - price)


def expiration_pl(positions: Sequence[dict], credit: float, price: float) -> float:
    total = float(credit)
    for pos in positions:
        total += pos['qty'] * _intrinsic(pos['type'], price, pos['strike']) * SHARES_PER_CONTRACT
    return total


def _upside_slope(positions: Sequence[dict]) -> float:
    """P/L change per $1 above the highest strike (only calls matter there)."""
    return sum(pos['qty'] for pos in positions if pos['type'].upper() == 'C') * SHARES_PER_CONTRACT


def _kink_points(positions: Sequence[dict]) -> List[float]:
    return [0.0] + sorted({float(pos['strike']) for pos in positions})


def max_profit_and_loss(positions: Sequence[dict], credit: float) -> Dict[str, Optional[float]]:
    """
    Exact expiration extremes of the piecewise-linear payoff.

    Returns None for a side that is unbounded (net long calls => unlimited
    profit, net short calls => unlimited loss). max_loss is reported as a
    negative P/L (or positive if the position can never lose).
    """
    points = _kink_points(positions)
    values = [expiration_pl(positions, credit, p) for p in points]
    slope = _upside_slope(positions)
    return {
        'max_profit': None if slope > 0 else max(values),
        'max_loss': None if slope < 0 else min(values),
    }


def breakeven_points(positions: Sequence[dict], credit: float) -> List[float]:
    points = _kink_points(positions)
    values = [expiration_pl(positions, credit, p) for p in points]
    roots: List[float] = []

    for i in range(len(points) - 1):
        p1, p2 = points[i], points[i + 1]
        v1, v2 = values[i], values[i + 1]
        if v1 == 0:
            roots.append(p1)
        elif v1 * v2 < 0:
            roots.append(p1 + (0 - v1) * (p2 - p1) / (v2 - v1))

    last_point, last_value = points[-1], values[-1]
    slope = _upside_slope(positions)
    if last_value == 0:
        roots.append(last_point)
    elif slope != 0 and (last_value > 0) != (slope > 0):
        roots.append(last_point - last_value / slope)

    return sorted({round(r, 4) for r in roots if r > 0})


def lognormal_cdf(
    price: float,
    spot: float,
    volatility: float,
    years: float,
    risk_free_rate: float = 0.0,
    dividend_yield: float = 0.0,
) -> float:
    """P(S_T <= price) under a risk-neutral lognormal distribution."""
    if price <= 0:
        return 0.0
    if math.isinf(price):
        return 1.0
    if years <= 0 or volatility <= 0:
        return 1.0 if spot <= price else 0.0
    mu = math.log(spot) + (risk_free_rate - dividend_yield - 0.5 * volatility ** 2) * years
    return float(norm.cdf((math.log(price) - mu) / (volatility * math.sqrt(years))))


def probability_of_profit(
    positions: Sequence[dict],
    credit: float,
    spot: float,
    volatility: float,
    years: float,
    risk_free_rate: float = 0.0,
    dividend_yield: float = 0.0,
) -> float:
    """Probability (0-1) that the position finishes above zero P/L at expiration."""
    edges = [0.0] + breakeven_points(positions, credit) + [math.inf]
    probability = 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        if math.isinf(upper):
            probe = lower * 1.5 + 1.0
        else:
            probe = (lower + upper) / 2
        if expiration_pl(positions, credit, probe) > 0:
            probability += (
                lognormal_cdf(upper, spot, volatility, years, risk_free_rate, dividend_yield)
                - lognormal_cdf(lower, spot, volatility, years, risk_free_rate, dividend_yield)
            )
    return min(1.0, max(0.0, probability))


def short_strike_risk(
    positions: Sequence[dict],
    spot: float,
    volatility: float,
    years: float,
    risk_free_rate: float = 0.0,
    dividend_yield: float = 0.0,
    position_ivs: Optional[Sequence[float]] = None,
) -> List[dict]:
    """
    Probability of finishing ITM and (≈2×ITM) of touching each short strike.

    Uses each leg's own IV when given (so skew is reflected), else `volatility`.
    """
    risks = []
    seen = set()
    for idx, pos in enumerate(positions):
        if pos['qty'] >= 0:
            continue
        key = (pos['type'].upper(), float(pos['strike']))
        if key in seen:
            continue
        seen.add(key)
        leg_vol = position_ivs[idx] if position_ivs and position_ivs[idx] else volatility
        cdf = lognormal_cdf(pos['strike'], spot, leg_vol, years, risk_free_rate, dividend_yield)
        itm = 1 - cdf if key[0] == 'C' else cdf
        risks.append({
            'strike': key[1],
            'type': key[0],
            'probability_itm': round(itm * 100, 2),
            'probability_of_touch': round(min(1.0, 2 * itm) * 100, 2),
        })
    return sorted(risks, key=lambda r: r['strike'])


def expected_move(spot: float, volatility: float, days: int) -> Optional[dict]:
    if spot <= 0 or volatility <= 0 or days <= 0:
        return None
    amount = spot * volatility * math.sqrt(days / 365.0)
    return {
        'amount': round(amount, 2),
        'lower': round(spot - amount, 2),
        'upper': round(spot + amount, 2),
        'days': days,
    }


def _bs_prices(
    option_type: str,
    spots: np.ndarray,
    strike: float,
    years: float,
    risk_free_rate: float,
    volatility: float,
    dividend_yield: float,
) -> np.ndarray:
    """Vectorized European Black-Scholes price; intrinsic at/after expiry."""
    is_call = option_type.upper() == 'C'
    if years <= 0 or volatility <= 0:
        return np.maximum(spots - strike, 0) if is_call else np.maximum(strike - spots, 0)
    sqrt_t = math.sqrt(years)
    d1 = (np.log(spots / strike) + (risk_free_rate - dividend_yield + 0.5 * volatility ** 2) * years) / (volatility * sqrt_t)
    d2 = d1 - volatility * sqrt_t
    disc_q = math.exp(-dividend_yield * years)
    disc_r = math.exp(-risk_free_rate * years)
    if is_call:
        return spots * disc_q * norm.cdf(d1) - strike * disc_r * norm.cdf(d2)
    return strike * disc_r * norm.cdf(-d2) - spots * disc_q * norm.cdf(-d1)


def probability_of_profit_target(
    positions: Sequence[dict],
    credit: float,
    target_pl: float,
    spot: float,
    path_volatility: float,
    position_ivs: Sequence[float],
    position_dtes: Sequence[int],
    risk_free_rate: float = 0.0,
    dividend_yield: float = 0.0,
    paths: int = 2000,
    max_steps: int = 120,
    seed: int = 7,
) -> Optional[float]:
    """
    Monte Carlo probability (0-1) that the position's mark-to-model P/L reaches
    `target_pl` on any day before the nearest expiration.
    """
    horizon = min(position_dtes) if position_dtes else 0
    if horizon <= 0 or spot <= 0 or path_volatility <= 0:
        return None

    step_days = max(1, math.ceil(horizon / max_steps))
    days = list(range(step_days, horizon, step_days)) + [horizon]

    rng = np.random.default_rng(seed)
    prices = np.full(paths, float(spot))
    hit = np.zeros(paths, dtype=bool)
    previous_day = 0

    for day in days:
        dt = (day - previous_day) / 365.0
        previous_day = day
        shocks = rng.standard_normal(paths)
        prices = prices * np.exp(
            (risk_free_rate - dividend_yield - 0.5 * path_volatility ** 2) * dt
            + path_volatility * math.sqrt(dt) * shocks
        )

        pl = np.full(paths, float(credit))
        for pos, iv, dte in zip(positions, position_ivs, position_dtes):
            remaining_years = max(0, dte - day) / 365.0
            values = _bs_prices(pos['type'], prices, pos['strike'], remaining_years, risk_free_rate, iv, dividend_yield)
            pl += pos['qty'] * values * SHARES_PER_CONTRACT
        hit |= pl >= target_pl

    return float(hit.mean())


def _naked_requirement(option_type: str, strike: float, spot: float, premium: float) -> float:
    """Reg-T requirement per contract for an uncovered short option."""
    if option_type.upper() == 'P':
        otm = max(0.0, spot - strike)
        minimum = NAKED_MINIMUM_RATE * strike
    else:
        otm = max(0.0, strike - spot)
        minimum = NAKED_MINIMUM_RATE * spot
    per_share = max(NAKED_UNDERLYING_RATE * spot - otm + premium, minimum + premium)
    return per_share * SHARES_PER_CONTRACT


def _side_requirement(
    side: List[tuple],
    option_type: str,
    spot: Optional[float],
) -> Optional[Dict[str, float]]:
    """
    Requirement for all legs of one option type.

    `side` is a list of (position, current_value_per_share). Uncovered short
    contracts use the naked formula (riskiest strikes first); the covered part
    is charged its worst-case spread loss.
    """
    shorts = [(p, v) for p, v in side if p['qty'] < 0]
    if not shorts:
        return {'requirement': 0.0, 'naked_premium': 0.0, 'naked': False}

    short_qty = sum(-p['qty'] for p, _ in shorts)
    long_qty = sum(p['qty'] for p, _ in side if p['qty'] > 0)
    naked_qty = max(0, short_qty - long_qty)

    # Riskiest shorts are the highest-strike puts / lowest-strike calls
    shorts.sort(key=lambda pv: pv[0]['strike'], reverse=option_type == 'P')
    naked_legs = []
    remaining = naked_qty
    for pos, value in shorts:
        if remaining <= 0:
            break
        take = min(remaining, -pos['qty'])
        naked_legs.append((pos, value, take))
        remaining -= take

    requirement = 0.0
    naked_premium = 0.0
    if naked_legs:
        if spot is None or any(v is None for _, v, _ in naked_legs):
            return None
        for pos, value, count in naked_legs:
            requirement += _naked_requirement(option_type, pos['strike'], spot, value) * count
            naked_premium += value * SHARES_PER_CONTRACT * count

    # Covered portion: worst expiration loss of this side with the naked
    # contracts removed (spread width).
    covered = []
    naked_by_id = {id(pos): count for pos, _, count in naked_legs}
    for pos, _ in side:
        qty = pos['qty'] + naked_by_id.get(id(pos), 0)
        if qty != 0:
            covered.append({**pos, 'qty': qty})
    if covered:
        worst = min(expiration_pl(covered, 0.0, p) for p in _kink_points(covered))
        requirement += max(0.0, -worst)

    return {'requirement': requirement, 'naked_premium': naked_premium, 'naked': bool(naked_legs)}


def estimate_buying_power(
    positions: Sequence[dict],
    credit: float,
    spot: Optional[float],
    option_values: Sequence[Optional[float]],
    max_loss: Optional[float],
) -> Optional[dict]:
    """
    Approximate broker buying-power reduction.

    Defined-risk positions use max loss. Positions with uncovered shorts use
    Reg-T naked rules; when both sides carry a requirement (e.g. a strangle)
    the larger side is charged plus the naked premium of the other side.
    """
    puts = [(p, v) for p, v in zip(positions, option_values) if p['type'].upper() == 'P']
    calls = [(p, v) for p, v in zip(positions, option_values) if p['type'].upper() == 'C']

    put_side = _side_requirement(puts, 'P', spot)
    call_side = _side_requirement(calls, 'C', spot)
    if put_side is None or call_side is None:
        return None

    if not put_side['naked'] and not call_side['naked']:
        if max_loss is None:
            return None
        return {'amount': round(max(0.0, -max_loss), 2), 'method': 'defined_risk'}

    if put_side['requirement'] >= call_side['requirement']:
        amount = put_side['requirement'] + call_side['naked_premium']
    else:
        amount = call_side['requirement'] + put_side['naked_premium']
    return {'amount': round(amount, 2), 'method': 'reg_t_naked'}


def market_credit_from_quotes(positions: Sequence[dict], quotes: Sequence[Optional[dict]]) -> Optional[dict]:
    """Net credit at mid and natural prices from per-leg bid/ask quotes."""
    if not positions or len(quotes) != len(positions):
        return None
    mid = natural = width = 0.0
    for pos, quote in zip(positions, quotes):
        bid = quote.get('bid') if quote else None
        ask = quote.get('ask') if quote else None
        if bid is None or ask is None or ask < bid:
            return None
        qty = pos['qty']
        mid += -qty * (bid + ask) / 2 * SHARES_PER_CONTRACT
        natural += -qty * (bid if qty < 0 else ask) * SHARES_PER_CONTRACT
        width += abs(qty) * (ask - bid) * SHARES_PER_CONTRACT
    return {
        'mid': round(mid, 2),
        'natural': round(natural, 2),
        'bid_ask_width': round(width, 2),
        'spread_pct': round(width / abs(mid) * 100, 2) if mid else None,
    }
