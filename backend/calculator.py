"""
Options P/L Calculator with Black-Scholes pricing and Greeks
Implements Black-Scholes from scratch using scipy
"""

import numpy as np
from scipy.stats import norm
from datetime import date
from typing import List, Dict, Optional
import logging

from market_data import calculate_days_to_expiration

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def calculate_d1_d2(stock_price: float, strike: float, time_to_expiration: float, risk_free_rate: float, volatility: float, dividend_yield: float = 0.0) -> tuple:
    """
    Calculate d1 and d2 for Black-Scholes formula with dividend yield

    d1 = [ln(S/K) + (r - q + σ²/2)T] / (σ√T)
    d2 = d1 - σ√T

    where q is the continuous dividend yield
    """
    if time_to_expiration <= 0 or volatility <= 0:
        return None, None

    # Adjust for continuous dividend yield
    adjusted_rate = risk_free_rate - dividend_yield

    d1 = (np.log(stock_price / strike) + (adjusted_rate + 0.5 * volatility ** 2) * time_to_expiration) / (volatility * np.sqrt(time_to_expiration))
    d2 = d1 - volatility * np.sqrt(time_to_expiration)
    return d1, d2


def calculate_black_scholes_price(
    option_type: str,
    stock_price: float,
    strike: float,
    days_to_expiration: int,
    risk_free_rate: float,
    implied_volatility: float,
    dividend_yield: float = 0.0,
    option_style: str = "European"
) -> float:
    """
    Calculate theoretical option price using Black-Scholes (European) or Binomial Tree (American)

    Args:
        option_type: 'C' for call, 'P' for put
        stock_price: Current stock price
        strike: Strike price
        days_to_expiration: Days until expiration
        risk_free_rate: Risk-free rate (annual, as decimal)
        implied_volatility: Implied volatility (annual, as decimal)
        dividend_yield: Continuous dividend yield (annual, as decimal)
        option_style: 'European' or 'American' (default: European)

    Returns:
        Theoretical option price per share
    """
    # Route to binomial tree for American options
    if option_style == "American":
        return calculate_american_option_binomial(
            option_type,
            stock_price,
            strike,
            days_to_expiration,
            risk_free_rate,
            implied_volatility,
            dividend_yield
        )
    if days_to_expiration <= 0:
        # At or past expiration, return intrinsic value
        if option_type.upper() == 'C':
            return max(0, stock_price - strike)
        else:
            return max(0, strike - stock_price)

    # Convert to time in years
    time_to_expiration = days_to_expiration / 365.0

    # Ensure parameters are valid
    if time_to_expiration <= 0 or implied_volatility <= 0:
        # Return intrinsic value if invalid parameters
        if option_type.upper() == 'C':
            return max(0, stock_price - strike)
        else:
            return max(0, strike - stock_price)

    try:
        d1, d2 = calculate_d1_d2(stock_price, strike, time_to_expiration, risk_free_rate, implied_volatility, dividend_yield)

        if d1 is None or d2 is None:
            # Fall back to intrinsic value
            if option_type.upper() == 'C':
                return max(0, stock_price - strike)
            else:
                return max(0, strike - stock_price)

        if option_type.upper() == 'C':
            # Call option with dividends: S * e^(-qT) * N(d1) - K * e^(-rT) * N(d2)
            price = (stock_price * np.exp(-dividend_yield * time_to_expiration) * norm.cdf(d1) -
                    strike * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(d2))
        else:
            # Put option with dividends: K * e^(-rT) * N(-d2) - S * e^(-qT) * N(-d1)
            price = (strike * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(-d2) -
                    stock_price * np.exp(-dividend_yield * time_to_expiration) * norm.cdf(-d1))

        return float(price)
    except Exception as e:
        logger.warning(f"Black-Scholes calculation failed: {e}. Returning intrinsic value.")
        # Fall back to intrinsic value
        if option_type.upper() == 'C':
            return max(0, stock_price - strike)
        else:
            return max(0, strike - stock_price)


def calculate_american_greeks_finite_diff(
    option_type: str,
    stock_price: float,
    strike: float,
    days_to_expiration: int,
    risk_free_rate: float,
    implied_volatility: float,
    dividend_yield: float = 0.0
) -> Dict[str, float]:
    """
    Calculate Greeks for American options using finite differences

    Args:
        option_type: 'C' for call, 'P' for put
        stock_price: Current stock price
        strike: Strike price
        days_to_expiration: Days until expiration
        risk_free_rate: Risk-free rate (annual, as decimal)
        implied_volatility: Implied volatility (annual, as decimal)
        dividend_yield: Dividend yield (annual, as decimal)

    Returns:
        Dict with keys: delta, gamma, theta, vega, rho
    """
    if days_to_expiration <= 0:
        return {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }

    try:
        # Base price
        base_price = calculate_american_option_binomial(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate, implied_volatility, dividend_yield
        )

        # Delta: sensitivity to stock price (use 1% change)
        dS = stock_price * 0.01
        price_up = calculate_american_option_binomial(
            option_type, stock_price + dS, strike, days_to_expiration,
            risk_free_rate, implied_volatility, dividend_yield
        )
        price_down = calculate_american_option_binomial(
            option_type, stock_price - dS, strike, days_to_expiration,
            risk_free_rate, implied_volatility, dividend_yield
        )
        delta = (price_up - price_down) / (2 * dS)

        # Gamma: rate of change of delta
        gamma = (price_up - 2 * base_price + price_down) / (dS ** 2)

        # Theta: time decay (per day)
        if days_to_expiration > 1:
            price_tomorrow = calculate_american_option_binomial(
                option_type, stock_price, strike, days_to_expiration - 1,
                risk_free_rate, implied_volatility, dividend_yield
            )
            theta = price_tomorrow - base_price  # Already per day
        else:
            theta = -base_price  # Decays to zero at expiration

        # Vega: sensitivity to volatility (per 1% IV change)
        dSigma = 0.01
        price_vol_up = calculate_american_option_binomial(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate, implied_volatility + dSigma, dividend_yield
        )
        price_vol_down = calculate_american_option_binomial(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate, implied_volatility - dSigma, dividend_yield
        )
        vega = (price_vol_up - price_vol_down) / 2  # Already per 1%

        # Rho: sensitivity to interest rate (per 1% change)
        dr = 0.01
        price_rate_up = calculate_american_option_binomial(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate + dr, implied_volatility, dividend_yield
        )
        price_rate_down = calculate_american_option_binomial(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate - dr, implied_volatility, dividend_yield
        )
        rho = (price_rate_up - price_rate_down) / 2  # Already per 1%

        return {
            'delta': float(delta),
            'gamma': float(gamma),
            'theta': float(theta),
            'vega': float(vega),
            'rho': float(rho)
        }

    except Exception as e:
        logger.warning(f"American Greeks calculation failed: {e}")
        return {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }


def calculate_option_greeks(
    option_type: str,
    stock_price: float,
    strike: float,
    days_to_expiration: int,
    risk_free_rate: float,
    implied_volatility: float,
    dividend_yield: float = 0.0,
    option_style: str = "European"
) -> Dict[str, float]:
    """
    Calculate all Greeks for an option using Black-Scholes formulas (European) or finite differences (American)

    Args:
        option_type: 'C' for call, 'P' for put
        stock_price: Current stock price
        strike: Strike price
        days_to_expiration: Days until expiration
        option_style: 'European' or 'American' (default: European)
        risk_free_rate: Risk-free rate (annual, as decimal)
        implied_volatility: Implied volatility (annual, as decimal)
        dividend_yield: Continuous dividend yield (annual, as decimal)

    Returns:
        Dict with keys: delta, gamma, theta, vega, rho
    """
    # Route to finite differences for American options
    if option_style == "American":
        return calculate_american_greeks_finite_diff(
            option_type, stock_price, strike, days_to_expiration,
            risk_free_rate, implied_volatility, dividend_yield
        )

    if days_to_expiration <= 0:
        # At expiration, Greeks are effectively zero (or undefined)
        return {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }

    time_to_expiration = days_to_expiration / 365.0

    if time_to_expiration <= 0 or implied_volatility <= 0:
        return {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }

    try:
        d1, d2 = calculate_d1_d2(stock_price, strike, time_to_expiration, risk_free_rate, implied_volatility, dividend_yield)

        if d1 is None or d2 is None:
            return {
                'delta': 0.0,
                'gamma': 0.0,
                'theta': 0.0,
                'vega': 0.0,
                'rho': 0.0
            }

        # Calculate Greeks with dividend yield adjustment
        discount_factor = np.exp(-dividend_yield * time_to_expiration)

        # Delta (adjusted for dividends)
        if option_type.upper() == 'C':
            delta = discount_factor * norm.cdf(d1)
        else:
            delta = -discount_factor * norm.cdf(-d1)

        # Gamma (same for calls and puts, adjusted for dividends)
        gamma = (discount_factor * norm.pdf(d1)) / (stock_price * implied_volatility * np.sqrt(time_to_expiration))

        # Theta (time decay - expressed as per day, so divide by 365)
        if option_type.upper() == 'C':
            theta = (- (stock_price * discount_factor * norm.pdf(d1) * implied_volatility) / (2 * np.sqrt(time_to_expiration))
                    - risk_free_rate * strike * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(d2)
                    + dividend_yield * stock_price * discount_factor * norm.cdf(d1)) / 365
        else:
            theta = (- (stock_price * discount_factor * norm.pdf(d1) * implied_volatility) / (2 * np.sqrt(time_to_expiration))
                    + risk_free_rate * strike * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(-d2)
                    - dividend_yield * stock_price * discount_factor * norm.cdf(-d1)) / 365

        # Vega (same for calls and puts, adjusted for dividends)
        vega = stock_price * discount_factor * norm.pdf(d1) * np.sqrt(time_to_expiration) / 100

        # Rho (sensitivity to interest rate) - expressed as per 1% change in rate
        if option_type.upper() == 'C':
            rho = strike * time_to_expiration * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(d2) / 100
        else:
            rho = -strike * time_to_expiration * np.exp(-risk_free_rate * time_to_expiration) * norm.cdf(-d2) / 100

        return {
            'delta': float(delta),
            'gamma': float(gamma),
            'theta': float(theta),
            'vega': float(vega),
            'rho': float(rho)
        }
    except Exception as e:
        logger.warning(f"Greeks calculation failed: {e}")
        return {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }


def calculate_intrinsic_value(option_type: str, stock_price: float, strike: float) -> float:
    """
    Calculate intrinsic value of an option

    Args:
        option_type: 'C' for call, 'P' for put
        stock_price: Current stock price
        strike: Strike price

    Returns:
        Intrinsic value per share
    """
    if option_type.upper() == 'C':
        return max(0, stock_price - strike)
    else:
        return max(0, strike - stock_price)


def calculate_american_option_binomial(
    option_type: str,
    stock_price: float,
    strike: float,
    days_to_expiration: int,
    risk_free_rate: float,
    implied_volatility: float,
    dividend_yield: float = 0.0,
    steps: int = 100
) -> float:
    """
    Calculate American option price using binomial tree model

    American options can be exercised at any time before expiration,
    so we need to check for early exercise at each node.

    Args:
        option_type: 'C' for call, 'P' for put
        stock_price: Current stock price
        strike: Strike price
        days_to_expiration: Days to expiration
        risk_free_rate: Risk-free rate (annual, as decimal)
        implied_volatility: Implied volatility (annual, as decimal)
        dividend_yield: Dividend yield (annual, as decimal)
        steps: Number of time steps in the tree (default 100)

    Returns:
        American option price per share
    """
    if days_to_expiration <= 0:
        return calculate_intrinsic_value(option_type, stock_price, strike)

    if implied_volatility <= 0 or stock_price <= 0 or strike <= 0:
        return calculate_intrinsic_value(option_type, stock_price, strike)

    try:
        # Time parameters
        time_to_expiration = days_to_expiration / 365.0
        dt = time_to_expiration / steps

        # Binomial tree parameters
        u = np.exp(implied_volatility * np.sqrt(dt))  # Up factor
        d = 1 / u  # Down factor

        # Risk-neutral probability (adjusted for dividends)
        a = np.exp((risk_free_rate - dividend_yield) * dt)
        p = (a - d) / (u - d)

        # Discount factor for one step
        discount = np.exp(-risk_free_rate * dt)

        # Initialize stock prices at maturity
        stock_prices = np.zeros(steps + 1)
        for i in range(steps + 1):
            stock_prices[i] = stock_price * (u ** (steps - i)) * (d ** i)

        # Initialize option values at maturity (intrinsic value)
        option_values = np.zeros(steps + 1)
        for i in range(steps + 1):
            if option_type.upper() == 'C':
                option_values[i] = max(0, stock_prices[i] - strike)
            else:
                option_values[i] = max(0, strike - stock_prices[i])

        # Step backwards through the tree
        for step in range(steps - 1, -1, -1):
            for i in range(step + 1):
                # Calculate stock price at this node
                S = stock_price * (u ** (step - i)) * (d ** i)

                # Calculate option value by discounting expected value
                hold_value = discount * (p * option_values[i] + (1 - p) * option_values[i + 1])

                # Calculate early exercise value
                if option_type.upper() == 'C':
                    exercise_value = max(0, S - strike)
                else:
                    exercise_value = max(0, strike - S)

                # For American options, take maximum of hold vs exercise
                option_values[i] = max(hold_value, exercise_value)

        return float(option_values[0])

    except Exception as e:
        logger.warning(f"American option pricing failed: {e}")
        return calculate_intrinsic_value(option_type, stock_price, strike)


def calculate_probability_metrics(data_points: List[dict], credit: float) -> dict:
    """
    Calculate probability of profit and risk/reward metrics

    Args:
        data_points: List of {price, pl} data points
        credit: Net credit/debit received

    Returns:
        Dict with probability_of_profit, max_profit, max_loss, breakeven_points
    """
    if not data_points:
        return {
            'probability_of_profit': 0.0,
            'max_profit': 0.0,
            'max_loss': 0.0,
            'breakeven_points': [],
            'risk_reward_ratio': None
        }

    # Find max profit and max loss
    pl_values = [d['pl'] for d in data_points]
    max_profit = max(pl_values)
    max_loss = min(pl_values)

    # Find breakeven points (where P/L crosses zero)
    breakeven_points = []
    for i in range(len(data_points) - 1):
        p1 = data_points[i]
        p2 = data_points[i + 1]

        # Check for sign change
        if (p1['pl'] >= 0 and p2['pl'] < 0) or (p1['pl'] < 0 and p2['pl'] >= 0):
            # Linear interpolation to find exact breakeven price
            breakeven_price = p1['price'] + (0 - p1['pl']) * (p2['price'] - p1['price']) / (p2['pl'] - p1['pl'])
            breakeven_points.append(round(breakeven_price, 2))

    # Calculate probability of profit (simple method: percentage of prices that are profitable)
    profitable_points = sum(1 for d in data_points if d['pl'] > 0)
    probability_of_profit = (profitable_points / len(data_points)) * 100 if data_points else 0

    # Calculate risk/reward ratio
    risk_reward_ratio = None
    if max_loss < 0 and max_profit > 0:
        risk_reward_ratio = abs(max_profit / max_loss)

    return {
        'probability_of_profit': round(probability_of_profit, 1),
        'max_profit': round(max_profit, 2),
        'max_loss': round(max_loss, 2),
        'breakeven_points': sorted(breakeven_points),
        'risk_reward_ratio': round(risk_reward_ratio, 2) if risk_reward_ratio else None
    }


def calculate_pl(
    positions: List[dict],
    credit: float,
    market_data: Optional[dict] = None,
    current_date: Optional[date] = None,
    use_theoretical_pricing: bool = True,
    range_percent: float = 0.5
) -> dict:
    """
    Calculate P/L with Black-Scholes pricing and Greeks

    Args:
        positions: List of position dicts with keys: qty, strike, type, expiration, symbol, manual_price, manual_iv
        credit: Net credit/debit received
        market_data: Dict with keys: symbol, current_price, implied_volatility, risk_free_rate, timestamp
        current_date: Current date for DTE calculation (default: today)
        use_theoretical_pricing: Use Black-Scholes (True) or intrinsic value (False)
        range_percent: Percentage to extend range beyond min/max strikes (default: 0.5 = 50%)

    Returns:
        Dict with keys:
            - data: List of {price, pl, theoretical_pl}
            - positions_with_greeks: List of position analysis
            - portfolio_greeks: Portfolio-level Greeks
            - market_data: Market data used
    """
    if not positions:
        raise ValueError("At least one position is required")

    if current_date is None:
        current_date = date.today()

    # Determine if we can calculate Black-Scholes
    can_calculate_bs = market_data is not None and use_theoretical_pricing

    # Determine price range based on strikes
    strikes = [p['strike'] for p in positions]
    min_strike = min(strikes)
    max_strike = max(strikes)
    lower_bound = min_strike * (1 - range_percent)
    upper_bound = max_strike * (1 + range_percent)

    start = int(np.floor(lower_bound))
    end = int(np.ceil(upper_bound))

    # Generate prices with $1 increments
    prices = np.arange(start, end + 1, 1)

    # Calculate Greeks for each position at current stock price
    positions_with_greeks = []

    if can_calculate_bs:
        current_stock_price = market_data['current_price']
        risk_free_rate = market_data['risk_free_rate']
        default_iv = market_data['implied_volatility']
        default_dividend_yield = market_data.get('dividend_yield', 0.0)

        for pos in positions:
            dte = calculate_days_to_expiration(pos['expiration'], current_date)
            iv = pos.get('manual_iv') or default_iv
            dividend_yield = pos.get('dividend_yield') or default_dividend_yield
            option_style = pos.get('style', 'American')

            # Calculate Greeks at current stock price
            option_greeks = calculate_option_greeks(
                pos['type'],
                current_stock_price,
                pos['strike'],
                dte,
                risk_free_rate,
                iv,
                dividend_yield,
                option_style
            )

            # Calculate theoretical value at current stock price
            theoretical_value = calculate_black_scholes_price(
                pos['type'],
                current_stock_price,
                pos['strike'],
                dte,
                risk_free_rate,
                iv,
                dividend_yield,
                option_style  # Already set to pos.get('style', 'American')
            )

            # Calculate intrinsic value at current stock price
            intrinsic_value = calculate_intrinsic_value(
                pos['type'],
                current_stock_price,
                pos['strike']
            )

            # Adjust Greeks by position quantity (negative for short positions)
            adjusted_greeks = {k: v * pos['qty'] for k, v in option_greeks.items()}

            positions_with_greeks.append({
                'position': pos,
                'greeks': adjusted_greeks,
                'theoretical_value': theoretical_value,
                'intrinsic_value': intrinsic_value
            })

    # Calculate portfolio Greeks (sum of position Greeks)
    portfolio_greeks = None
    if positions_with_greeks:
        portfolio_greeks = {
            'delta': sum(p['greeks']['delta'] for p in positions_with_greeks),
            'gamma': sum(p['greeks']['gamma'] for p in positions_with_greeks),
            'theta': sum(p['greeks']['theta'] for p in positions_with_greeks),
            'vega': sum(p['greeks']['vega'] for p in positions_with_greeks),
            'rho': sum(p['greeks']['rho'] for p in positions_with_greeks)
        }

    # Helper to calculate intrinsic P/L for a single price (at expiration)
    def get_intrinsic_pl(stock_price):
        total_pl = float(credit)
        for pos in positions:
            qty = pos['qty']
            strike = pos['strike']
            option_type = pos['type']

            intrinsic = calculate_intrinsic_value(option_type, stock_price, strike)
            total_pl += qty * intrinsic * 100  # 100 shares per contract

        return total_pl

    # Helper to calculate theoretical P/L for a single price (Black-Scholes)
    def get_theoretical_pl(stock_price):
        if not can_calculate_bs:
            return get_intrinsic_pl(stock_price)

        total_pl = float(credit)
        risk_free_rate = market_data['risk_free_rate']
        default_iv = market_data['implied_volatility']
        default_dividend_yield = market_data.get('dividend_yield', 0.0)

        for pos in positions:
            qty = pos['qty']
            strike = pos['strike']
            option_type = pos['type']

            dte = calculate_days_to_expiration(pos['expiration'], current_date)
            iv = pos.get('manual_iv') or default_iv
            dividend_yield = pos.get('dividend_yield') or default_dividend_yield
            option_style = pos.get('style', 'American')

            # Calculate theoretical value
            theoretical_value = calculate_black_scholes_price(
                option_type,
                stock_price,
                strike,
                dte,
                risk_free_rate,
                iv,
                dividend_yield,
                option_style
            )

            total_pl += qty * theoretical_value * 100  # 100 shares per contract

        return total_pl

    # Helper to calculate portfolio Greeks at a single price
    def get_portfolio_greeks_at_price(stock_price):
        if not can_calculate_bs:
            return None

        risk_free_rate = market_data['risk_free_rate']
        default_iv = market_data['implied_volatility']
        default_dividend_yield = market_data.get('dividend_yield', 0.0)

        portfolio_greeks_at_price = {
            'delta': 0.0,
            'gamma': 0.0,
            'theta': 0.0,
            'vega': 0.0,
            'rho': 0.0
        }

        for pos in positions:
            dte = calculate_days_to_expiration(pos['expiration'], current_date)
            iv = pos.get('manual_iv') or default_iv
            dividend_yield = pos.get('dividend_yield') or default_dividend_yield
            option_style = pos.get('style', 'American')

            # Calculate Greeks at this stock price
            greeks = calculate_option_greeks(
                pos['type'],
                stock_price,
                pos['strike'],
                dte,
                risk_free_rate,
                iv,
                dividend_yield,
                option_style
            )

            # Accumulate position-weighted Greeks
            for greek_name in portfolio_greeks_at_price.keys():
                portfolio_greeks_at_price[greek_name] += greeks[greek_name] * pos['qty']

        return portfolio_greeks_at_price

    # Calculate exact breakeven points for intrinsic value
    breakeven_points = []
    check_points = sorted(list(set([start, end] + strikes)))

    for i in range(len(check_points) - 1):
        p1 = check_points[i]
        p2 = check_points[i + 1]

        pl1 = get_intrinsic_pl(p1)
        pl2 = get_intrinsic_pl(p2)

        if pl1 == 0:
            breakeven_points.append(p1)

        if pl1 * pl2 < 0:
            # Linear interpolation to find exact breakeven
            root = p1 + (0 - pl1) * (p2 - p1) / (pl2 - pl1)
            breakeven_points.append(root)

    if get_intrinsic_pl(check_points[-1]) == 0:
        breakeven_points.append(check_points[-1])

    # Merge integer prices and breakeven points
    all_prices = sorted(list(set(prices.tolist() + breakeven_points)))

    # Generate data points
    data_points = []
    # Calculate Greeks only for every Nth point to optimize performance (especially for American options)
    greek_calculation_interval = 5  # Calculate Greeks every 5 price points

    for idx, price in enumerate(all_prices):
        intrinsic_pl = get_intrinsic_pl(price)
        theoretical_pl = get_theoretical_pl(price) if can_calculate_bs else intrinsic_pl

        data_point = {
            "price": float(price),
            "pl": float(round(intrinsic_pl, 2)),  # At expiration
            "theoretical_pl": float(round(theoretical_pl, 2))  # Current theoretical
        }

        # Add Greeks at this price point for visualization (only every Nth point for performance)
        if can_calculate_bs and idx % greek_calculation_interval == 0:
            try:
                greeks_at_price = get_portfolio_greeks_at_price(price)
                if greeks_at_price:
                    data_point["delta"] = float(round(greeks_at_price['delta'], 4))
                    data_point["gamma"] = float(round(greeks_at_price['gamma'], 6))
                    data_point["theta"] = float(round(greeks_at_price['theta'], 4))
                    data_point["vega"] = float(round(greeks_at_price['vega'], 4))
            except Exception as e:
                logger.warning(f"Failed to calculate Greeks at price {price}: {e}")
                # Continue without Greeks for this point

        data_points.append(data_point)

    # Calculate probability metrics
    probability_metrics = calculate_probability_metrics(data_points, credit)

    return {
        'data': data_points,
        'positions_with_greeks': positions_with_greeks if can_calculate_bs else None,
        'portfolio_greeks': portfolio_greeks,
        'market_data': market_data,
        'probability_metrics': probability_metrics
    }
