import math
from datetime import date

import pytest

import seller_metrics as sm
from calculator import calculate_pl


def leg(qty, strike, option_type, expiration='Feb 20 25'):
    return {'qty': qty, 'strike': strike, 'type': option_type, 'expiration': expiration}


PUT_SPREAD = [leg(-1, 100, 'P'), leg(1, 95, 'P')]
STRANGLE = [leg(-1, 95, 'P'), leg(-1, 105, 'C')]
IRON_CONDOR = [leg(1, 90, 'P'), leg(-1, 95, 'P'), leg(-1, 105, 'C'), leg(1, 110, 'C')]


class TestPayoffExtremes:
    def test_credit_spread_is_bounded(self):
        result = sm.max_profit_and_loss(PUT_SPREAD, 150)
        assert result == {'max_profit': 150, 'max_loss': -350}

    def test_short_call_has_unlimited_loss(self):
        result = sm.max_profit_and_loss(STRANGLE, 400)
        assert result['max_profit'] == 400
        assert result['max_loss'] is None

    def test_long_call_has_unlimited_profit(self):
        result = sm.max_profit_and_loss([leg(1, 100, 'C')], -500)
        assert result['max_profit'] is None
        assert result['max_loss'] == -500

    def test_naked_put_max_loss_is_bounded_at_zero(self):
        result = sm.max_profit_and_loss([leg(-1, 50, 'P')], 200)
        assert result['max_loss'] == -4800


class TestBreakevens:
    def test_put_spread(self):
        assert sm.breakeven_points(PUT_SPREAD, 150) == [98.5]

    def test_strangle_includes_upside_beyond_last_strike(self):
        assert sm.breakeven_points(STRANGLE, 400) == [91, 109]

    def test_iron_condor(self):
        assert sm.breakeven_points(IRON_CONDOR, 200) == [93, 107]


class TestProbabilities:
    def test_strangle_pop_matches_distribution_between_breakevens(self):
        spot, vol, years = 100.0, 0.25, 30 / 365
        pop = sm.probability_of_profit(STRANGLE, 400, spot, vol, years)
        expected = sm.lognormal_cdf(109, spot, vol, years) - sm.lognormal_cdf(91, spot, vol, years)
        assert pop == pytest.approx(expected)

    def test_far_otm_short_put_has_high_pop(self):
        pop = sm.probability_of_profit([leg(-1, 80, 'P')], 50, 100.0, 0.25, 30 / 365)
        assert pop > 0.9

    def test_long_call_pop_is_probability_above_breakeven(self):
        spot, vol, years = 100.0, 0.3, 60 / 365
        pop = sm.probability_of_profit([leg(1, 100, 'C')], -500, spot, vol, years)
        assert pop == pytest.approx(1 - sm.lognormal_cdf(105, spot, vol, years))

    def test_touch_is_about_twice_itm(self):
        risks = sm.short_strike_risk(STRANGLE, 100.0, 0.25, 30 / 365)
        assert [r['strike'] for r in risks] == [95, 105]
        for risk in risks:
            assert risk['probability_of_touch'] == pytest.approx(min(100, 2 * risk['probability_itm']), abs=0.02)

    def test_touch_uses_leg_iv_when_given(self):
        flat = sm.short_strike_risk(STRANGLE, 100.0, 0.25, 30 / 365)
        skewed = sm.short_strike_risk(STRANGLE, 100.0, 0.25, 30 / 365, position_ivs=[0.35, 0.18])
        put_flat, call_flat = flat
        put_skew, call_skew = skewed
        assert put_skew['probability_itm'] > put_flat['probability_itm']
        assert call_skew['probability_itm'] < call_flat['probability_itm']

    def test_profit_target_probability_is_monotonic(self):
        common = dict(
            spot=100.0,
            path_volatility=0.25,
            position_ivs=[0.25, 0.25],
            position_dtes=[45, 45],
        )
        easy = sm.probability_of_profit_target(STRANGLE, 400, target_pl=100, **common)
        hard = sm.probability_of_profit_target(STRANGLE, 400, target_pl=300, **common)
        assert 0 <= hard <= easy <= 1

    def test_expected_move(self):
        move = sm.expected_move(100.0, 0.365, 365)
        assert move == {'amount': 36.5, 'lower': 63.5, 'upper': 136.5, 'days': 365}


class TestBuyingPower:
    def test_defined_risk_uses_max_loss(self):
        bp = sm.estimate_buying_power(IRON_CONDOR, 200, 100.0, [0.5, 1.0, 1.0, 0.5], -300)
        assert bp == {'amount': 300, 'method': 'defined_risk'}

    def test_naked_put_reg_t(self):
        # max(20% * 100 - 5 OTM + 1, 10% * 95 + 1) = 16 per share
        bp = sm.estimate_buying_power([leg(-1, 95, 'P')], 100, 100.0, [1.0], -9400)
        assert bp == {'amount': 1600, 'method': 'reg_t_naked'}

    def test_strangle_charges_larger_side_plus_other_premium(self):
        # put: max(20-5+1.2, 9.5+1.2) = 16.2 ; call: max(20-5+1.0, 10+1.0) = 16.0
        bp = sm.estimate_buying_power(STRANGLE, 220, 100.0, [1.2, 1.0], None)
        assert bp['amount'] == pytest.approx(1620 + 100)

    def test_jade_lizard_adds_call_spread_width_when_larger(self):
        positions = [leg(-1, 95, 'P'), leg(-1, 105, 'C'), leg(1, 110, 'C')]
        bp = sm.estimate_buying_power(positions, 250, 100.0, [1.0, 1.0, 0.5], -9250)
        # put side 1600 vs call spread width 500 -> put side wins, call side has no naked premium
        assert bp == {'amount': 1600, 'method': 'reg_t_naked'}

    def test_naked_without_price_is_unknown(self):
        assert sm.estimate_buying_power([leg(-1, 95, 'P')], 100, None, [None], -9400) is None


class TestMarketCredit:
    def test_mid_and_natural(self):
        quotes = [{'bid': 2.0, 'ask': 2.2}, {'bid': 0.9, 'ask': 1.1}]
        credit = sm.market_credit_from_quotes(PUT_SPREAD, quotes)
        assert credit == {'mid': 110.0, 'natural': 90.0, 'bid_ask_width': 40.0, 'spread_pct': pytest.approx(36.36)}

    def test_missing_quote_returns_none(self):
        assert sm.market_credit_from_quotes(PUT_SPREAD, [{'bid': 2.0, 'ask': 2.2}, None]) is None


class TestCalculatePLSellerMetrics:
    market_data = {
        'symbol': 'TEST',
        'current_price': 100.0,
        'implied_volatility': 0.30,
        'risk_free_rate': 0.045,
    }

    def test_response_includes_seller_metrics(self):
        result = calculate_pl(IRON_CONDOR, 200, market_data=self.market_data, current_date=date(2025, 1, 15))
        probability = result['probability_metrics']
        assert probability['max_profit'] == 200
        assert probability['max_loss'] == -300
        assert probability['breakeven_points'] == [93, 107]
        assert 0 < probability['probability_of_profit'] < 100
        assert probability['probability_of_profit_target'] is not None

        seller = result['seller_metrics']
        assert seller['buying_power'] == 300
        assert seller['return_on_capital'] == pytest.approx(200 / 300, abs=1e-4)
        assert seller['days_to_expiration'] == 36
        assert seller['annualized_return'] == pytest.approx(200 / 300 * 365 / 36, abs=1e-3)
        assert seller['theta_per_day'] > 0
        assert seller['expected_move']['amount'] == pytest.approx(100 * 0.30 * math.sqrt(36 / 365), abs=0.01)

    def test_metrics_without_market_data(self):
        result = calculate_pl(PUT_SPREAD, 150, market_data=None, current_date=date(2025, 1, 15),
                              use_theoretical_pricing=False)
        assert result['probability_metrics']['probability_of_profit'] is None
        assert result['seller_metrics']['buying_power'] == 350

    def test_iv_crush_helps_short_premium_curve(self):
        base = calculate_pl(STRANGLE, 400, market_data=self.market_data, current_date=date(2025, 1, 15))
        crushed = calculate_pl(STRANGLE, 400, market_data=self.market_data, current_date=date(2025, 1, 15),
                               iv_shift=-0.3)
        at_spot = lambda r: next(p for p in r['data'] if p['price'] == 100)
        assert at_spot(crushed)['theoretical_pl'] > at_spot(base)['theoretical_pl']
        assert at_spot(crushed)['pl'] == at_spot(base)['pl']

    def test_scenario_legs_report_unshifted_inputs(self):
        result = calculate_pl(STRANGLE, 400, market_data=self.market_data, current_date=date(2025, 1, 15),
                              iv_shift=-0.3)
        legs = result['scenario_legs']
        assert len(legs) == len(STRANGLE)
        assert all(leg['iv'] == self.market_data['implied_volatility'] for leg in legs)
        assert all(leg['dte'] > 0 for leg in legs)

    def test_earnings_inside_trade_is_flagged(self):
        market_data = {**self.market_data, 'earnings_date': '2025-02-01'}
        result = calculate_pl(STRANGLE, 400, market_data=market_data, current_date=date(2025, 1, 15))
        assert result['seller_metrics']['earnings_before_expiration'] is True
