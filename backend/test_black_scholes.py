"""
Tests for Black-Scholes pricing and Greeks calculations
"""

import pytest
from datetime import date
from calculator import (
    calculate_black_scholes_price,
    calculate_option_greeks,
    calculate_intrinsic_value,
    calculate_pl
)
from market_data import calculate_days_to_expiration, MarketDataFetcher


class TestBlackScholesPricing:
    """Tests for Black-Scholes option pricing"""

    def test_call_option_pricing_atm(self):
        """Test Black-Scholes call option pricing for ATM option"""
        price = calculate_black_scholes_price(
            option_type='C',
            stock_price=100,
            strike=100,
            days_to_expiration=30,
            risk_free_rate=0.05,
            implied_volatility=0.20
        )
        # ATM call with 30 DTE should be around $2-3
        assert 1.5 < price < 4.0, f"ATM call price {price} outside expected range"

    def test_put_option_pricing_atm(self):
        """Test Black-Scholes put option pricing for ATM option"""
        price = calculate_black_scholes_price(
            option_type='P',
            stock_price=100,
            strike=100,
            days_to_expiration=30,
            risk_free_rate=0.05,
            implied_volatility=0.20
        )
        # ATM put with 30 DTE should be around $2-3
        assert 1.5 < price < 4.0, f"ATM put price {price} outside expected range"

    def test_itm_call_more_expensive_than_otm(self):
        """ITM call should be more expensive than OTM call"""
        itm_price = calculate_black_scholes_price('C', 110, 100, 30, 0.05, 0.20)
        otm_price = calculate_black_scholes_price('C', 90, 100, 30, 0.05, 0.20)
        assert itm_price > otm_price, f"ITM call {itm_price} should be > OTM call {otm_price}"

    def test_itm_put_more_expensive_than_otm(self):
        """ITM put should be more expensive than OTM put"""
        itm_price = calculate_black_scholes_price('P', 90, 100, 30, 0.05, 0.20)
        otm_price = calculate_black_scholes_price('P', 110, 100, 30, 0.05, 0.20)
        assert itm_price > otm_price, f"ITM put {itm_price} should be > OTM put {otm_price}"

    def test_expired_option_returns_intrinsic_value(self):
        """Option with DTE=0 should return intrinsic value"""
        # ITM call at expiration
        call_price = calculate_black_scholes_price('C', 110, 100, 0, 0.05, 0.20)
        assert call_price == 10.0, "Expired ITM call should equal intrinsic value"

        # OTM put at expiration
        put_price = calculate_black_scholes_price('P', 110, 100, 0, 0.05, 0.20)
        assert put_price == 0.0, "Expired OTM put should be worthless"

    def test_longer_expiration_more_valuable(self):
        """Options with longer expiration should be more valuable (time value)"""
        short_exp = calculate_black_scholes_price('C', 100, 100, 10, 0.05, 0.20)
        long_exp = calculate_black_scholes_price('C', 100, 100, 60, 0.05, 0.20)
        assert long_exp > short_exp, "Longer dated option should be more valuable"

    def test_higher_volatility_more_valuable(self):
        """Options with higher IV should be more valuable"""
        low_vol = calculate_black_scholes_price('C', 100, 100, 30, 0.05, 0.15)
        high_vol = calculate_black_scholes_price('C', 100, 100, 30, 0.05, 0.30)
        assert high_vol > low_vol, "Higher IV option should be more valuable"


class TestGreeksCalculation:
    """Tests for option Greeks calculations"""

    def test_atm_call_delta_around_half(self):
        """ATM call delta should be around 0.5"""
        greeks = calculate_option_greeks('C', 100, 100, 30, 0.05, 0.20)
        assert 0.4 < greeks['delta'] < 0.6, f"ATM call delta {greeks['delta']} should be ~0.5"

    def test_atm_put_delta_around_negative_half(self):
        """ATM put delta should be around -0.5"""
        greeks = calculate_option_greeks('P', 100, 100, 30, 0.05, 0.20)
        assert -0.6 < greeks['delta'] < -0.4, f"ATM put delta {greeks['delta']} should be ~-0.5"

    def test_gamma_positive_for_long_options(self):
        """Gamma should be positive for both calls and puts"""
        call_greeks = calculate_option_greeks('C', 100, 100, 30, 0.05, 0.20)
        put_greeks = calculate_option_greeks('P', 100, 100, 30, 0.05, 0.20)

        assert call_greeks['gamma'] > 0, "Call gamma should be positive"
        assert put_greeks['gamma'] > 0, "Put gamma should be positive"

    def test_theta_negative_for_long_options(self):
        """Theta should be negative for long options (time decay)"""
        call_greeks = calculate_option_greeks('C', 100, 100, 30, 0.05, 0.20)
        put_greeks = calculate_option_greeks('P', 100, 100, 30, 0.05, 0.20)

        assert call_greeks['theta'] < 0, "Call theta should be negative (time decay)"
        assert put_greeks['theta'] < 0, "Put theta should be negative (time decay)"

    def test_vega_positive_for_long_options(self):
        """Vega should be positive for long options (benefit from higher IV)"""
        call_greeks = calculate_option_greeks('C', 100, 100, 30, 0.05, 0.20)
        put_greeks = calculate_option_greeks('P', 100, 100, 30, 0.05, 0.20)

        assert call_greeks['vega'] > 0, "Call vega should be positive"
        assert put_greeks['vega'] > 0, "Put vega should be positive"

    def test_expired_option_greeks_are_zero(self):
        """Expired options should have zero Greeks"""
        greeks = calculate_option_greeks('C', 100, 100, 0, 0.05, 0.20)

        assert greeks['delta'] == 0.0, "Expired option delta should be 0"
        assert greeks['gamma'] == 0.0, "Expired option gamma should be 0"
        assert greeks['theta'] == 0.0, "Expired option theta should be 0"
        assert greeks['vega'] == 0.0, "Expired option vega should be 0"
        assert greeks['rho'] == 0.0, "Expired option rho should be 0"

    def test_itm_call_delta_above_half(self):
        """Deep ITM call should have delta approaching 1.0"""
        greeks = calculate_option_greeks('C', 120, 100, 30, 0.05, 0.20)
        assert greeks['delta'] > 0.7, f"Deep ITM call delta {greeks['delta']} should be > 0.7"

    def test_otm_call_delta_below_half(self):
        """Deep OTM call should have delta approaching 0.0"""
        greeks = calculate_option_greeks('C', 80, 100, 30, 0.05, 0.20)
        assert greeks['delta'] < 0.3, f"Deep OTM call delta {greeks['delta']} should be < 0.3"


class TestIntrinsicValue:
    """Tests for intrinsic value calculations"""

    def test_itm_call_intrinsic_value(self):
        """ITM call intrinsic value should equal (stock - strike)"""
        value = calculate_intrinsic_value('C', 110, 100)
        assert value == 10.0, f"ITM call intrinsic value should be 10, got {value}"

    def test_otm_call_intrinsic_value(self):
        """OTM call should have zero intrinsic value"""
        value = calculate_intrinsic_value('C', 90, 100)
        assert value == 0.0, f"OTM call intrinsic value should be 0, got {value}"

    def test_itm_put_intrinsic_value(self):
        """ITM put intrinsic value should equal (strike - stock)"""
        value = calculate_intrinsic_value('P', 90, 100)
        assert value == 10.0, f"ITM put intrinsic value should be 10, got {value}"

    def test_otm_put_intrinsic_value(self):
        """OTM put should have zero intrinsic value"""
        value = calculate_intrinsic_value('P', 110, 100)
        assert value == 0.0, f"OTM put intrinsic value should be 0, got {value}"


class TestDaysToExpiration:
    """Tests for expiration date parsing"""

    def test_parse_month_day_format(self):
        """Test parsing 'Jan 16' format"""
        current_date = date(2025, 1, 1)
        dte = calculate_days_to_expiration("Jan 16", current_date)
        assert dte == 15, f"Expected 15 days, got {dte}"

    def test_parse_month_day_next_year(self):
        """Test parsing 'Jan 16' when it's in the future year"""
        current_date = date(2025, 12, 20)
        dte = calculate_days_to_expiration("Jan 16", current_date)
        # Should assume next year (2026)
        expected_date = date(2026, 1, 16)
        expected_dte = (expected_date - current_date).days
        assert dte == expected_dte, f"Expected {expected_dte} days, got {dte}"

    def test_parse_iso_format(self):
        """Test parsing '2025-01-16' ISO format"""
        current_date = date(2025, 1, 1)
        dte = calculate_days_to_expiration("2025-01-16", current_date)
        assert dte == 15, f"Expected 15 days, got {dte}"

    def test_expired_option_returns_zero_dte(self):
        """Test that expired options return 0 DTE"""
        current_date = date(2025, 1, 20)
        dte = calculate_days_to_expiration("Jan 16", current_date)
        assert dte == 0, f"Expired option should return 0 DTE, got {dte}"


class TestCalculatePLIntegration:
    """Integration tests for full P/L calculation with Black-Scholes"""

    def test_calculate_pl_with_market_data(self):
        """Test P/L calculation with Black-Scholes pricing"""
        positions = [
            {'qty': -1, 'strike': 100, 'type': 'P', 'expiration': 'Jan 16'},
            {'qty': -1, 'strike': 110, 'type': 'C', 'expiration': 'Jan 16'}
        ]
        credit = 500.0
        market_data = {
            'symbol': 'TEST',
            'current_price': 105.0,
            'implied_volatility': 0.25,
            'risk_free_rate': 0.045
        }
        current_date = date(2025, 1, 1)

        result = calculate_pl(
            positions,
            credit,
            market_data=market_data,
            current_date=current_date,
            use_theoretical_pricing=True
        )

        # Check structure
        assert 'data' in result, "Result should contain 'data'"
        assert 'positions_with_greeks' in result, "Result should contain 'positions_with_greeks'"
        assert 'portfolio_greeks' in result, "Result should contain 'portfolio_greeks'"

        # Check data points
        assert len(result['data']) > 0, "Should have data points"
        first_point = result['data'][0]
        assert 'price' in first_point, "Data point should have price"
        assert 'pl' in first_point, "Data point should have pl (intrinsic)"
        assert 'theoretical_pl' in first_point, "Data point should have theoretical_pl"

        # Check Greeks
        assert result['positions_with_greeks'] is not None, "Should have Greeks data"
        assert len(result['positions_with_greeks']) == 2, "Should have Greeks for 2 positions"

        # Check portfolio Greeks
        assert result['portfolio_greeks'] is not None, "Should have portfolio Greeks"
        assert 'delta' in result['portfolio_greeks'], "Portfolio Greeks should include delta"

    def test_calculate_pl_without_market_data(self):
        """Test P/L calculation without market data (backward compatibility)"""
        positions = [
            {'qty': -1, 'strike': 100, 'type': 'P', 'expiration': 'Jan 16'},
            {'qty': -1, 'strike': 110, 'type': 'C', 'expiration': 'Jan 16'}
        ]
        credit = 500.0

        result = calculate_pl(
            positions,
            credit,
            market_data=None,
            current_date=date(2025, 1, 1),
            use_theoretical_pricing=False
        )

        # Should still work with intrinsic value
        assert 'data' in result, "Result should contain 'data'"
        assert len(result['data']) > 0, "Should have data points"

        # Greeks should be None
        assert result['positions_with_greeks'] is None, "Should not have Greeks without market data"
        assert result['portfolio_greeks'] is None, "Should not have portfolio Greeks without market data"

    def test_calculate_pl_short_strangle(self):
        """Test P/L for a short strangle strategy"""
        positions = [
            {'qty': -2, 'strike': 95, 'type': 'P', 'expiration': 'Feb 20'},
            {'qty': -2, 'strike': 105, 'type': 'C', 'expiration': 'Feb 20'}
        ]
        credit = 800.0
        market_data = {
            'symbol': 'TEST',
            'current_price': 100.0,
            'implied_volatility': 0.30,
            'risk_free_rate': 0.045
        }

        result = calculate_pl(
            positions,
            credit,
            market_data=market_data,
            current_date=date(2025, 1, 15),
            use_theoretical_pricing=True
        )

        # Portfolio should be net short delta (negative delta)
        portfolio_delta = result['portfolio_greeks']['delta']
        # For a short strangle at ATM, portfolio delta should be near zero but slightly negative
        assert -0.3 < portfolio_delta < 0.1, f"Short strangle portfolio delta {portfolio_delta} unexpected"

        # Portfolio theta should be positive (benefit from time decay)
        portfolio_theta = result['portfolio_greeks']['theta']
        assert portfolio_theta > 0, f"Short strangle should have positive theta, got {portfolio_theta}"

    def test_calculate_pl_long_call(self):
        """Test P/L for a simple long call"""
        positions = [
            {'qty': 1, 'strike': 100, 'type': 'C', 'expiration': 'Mar 21'}
        ]
        credit = -500.0  # Paid $5 per share
        market_data = {
            'symbol': 'TEST',
            'current_price': 100.0,
            'implied_volatility': 0.25,
            'risk_free_rate': 0.045
        }

        result = calculate_pl(
            positions,
            credit,
            market_data=market_data,
            current_date=date(2025, 2, 1),
            use_theoretical_pricing=True
        )

        # Long call should have positive delta
        portfolio_delta = result['portfolio_greeks']['delta']
        assert 0.3 < portfolio_delta < 0.7, f"Long ATM call delta {portfolio_delta} should be ~0.5"

        # Long call should have negative theta (time decay hurts)
        portfolio_theta = result['portfolio_greeks']['theta']
        assert portfolio_theta < 0, f"Long call should have negative theta, got {portfolio_theta}"

        # Long call should have positive vega (benefits from higher IV)
        portfolio_vega = result['portfolio_greeks']['vega']
        assert portfolio_vega > 0, f"Long call should have positive vega, got {portfolio_vega}"


class TestMarketDataFetcher:
    """Tests for market data fetching (basic tests, mocking would be better for real tests)"""

    def test_parse_expiration_date_various_formats(self):
        """Test parsing various expiration date formats"""
        fetcher = MarketDataFetcher()
        reference = date(2025, 1, 1)

        # Test "Jan 16" format
        parsed = fetcher.parse_expiration_date("Jan 16", reference)
        assert parsed == date(2025, 1, 16), "Failed to parse 'Jan 16'"

        # Test ISO format
        parsed = fetcher.parse_expiration_date("2025-03-21", reference)
        assert parsed == date(2025, 3, 21), "Failed to parse ISO format"

        # Test US format
        parsed = fetcher.parse_expiration_date("3/21/2025", reference)
        assert parsed == date(2025, 3, 21), "Failed to parse US format"

    def test_default_risk_free_rate(self):
        """Test that default risk-free rate is reasonable"""
        fetcher = MarketDataFetcher()
        rate = fetcher.get_risk_free_rate()
        assert 0.0 < rate < 0.2, f"Risk-free rate {rate} seems unreasonable"


class TestAmericanOptions:
    """Tests for American option pricing"""

    def test_american_put_higher_than_european_put(self):
        """American put should be worth more than European put due to early exercise"""
        # Deep ITM put with high risk-free rate
        european_price = calculate_black_scholes_price(
            option_type='P',
            stock_price=80,
            strike=100,
            days_to_expiration=60,
            risk_free_rate=0.10,
            implied_volatility=0.30,
            option_style="European"
        )

        american_price = calculate_black_scholes_price(
            option_type='P',
            stock_price=80,
            strike=100,
            days_to_expiration=60,
            risk_free_rate=0.10,
            implied_volatility=0.30,
            option_style="American"
        )

        # American put should be worth at least as much as European put
        assert american_price >= european_price, \
            f"American put ({american_price}) should >= European put ({european_price})"

        # For deep ITM puts, American should have meaningful early exercise premium
        assert american_price > european_price * 1.01, \
            "American put should have early exercise premium"

    def test_american_call_no_dividend_equals_european(self):
        """American call on non-dividend stock should equal European call"""
        european_price = calculate_black_scholes_price(
            option_type='C',
            stock_price=100,
            strike=100,
            days_to_expiration=30,
            risk_free_rate=0.05,
            implied_volatility=0.20,
            dividend_yield=0.0,
            option_style="European"
        )

        american_price = calculate_black_scholes_price(
            option_type='C',
            stock_price=100,
            strike=100,
            days_to_expiration=30,
            risk_free_rate=0.05,
            implied_volatility=0.20,
            dividend_yield=0.0,
            option_style="American"
        )

        # Should be very close (within 1%)
        assert abs(american_price - european_price) / european_price < 0.01, \
            f"American call ({american_price}) should ≈ European call ({european_price}) with no dividends"

    def test_american_greeks_calculation(self):
        """Test that American Greeks can be calculated"""
        greeks = calculate_option_greeks(
            option_type='P',
            stock_price=100,
            strike=100,
            days_to_expiration=30,
            risk_free_rate=0.05,
            implied_volatility=0.25,
            dividend_yield=0.0,
            option_style="American"
        )

        # Check all Greeks are present
        assert 'delta' in greeks
        assert 'gamma' in greeks
        assert 'theta' in greeks
        assert 'vega' in greeks
        assert 'rho' in greeks

        # ATM put delta should be around -0.5
        assert -0.7 < greeks['delta'] < -0.3, \
            f"ATM put delta {greeks['delta']} outside expected range"

        # Gamma should be positive
        assert greeks['gamma'] > 0, "Gamma should be positive for long options"

        # Theta should be negative for long options
        assert greeks['theta'] < 0, "Theta should be negative for long options"

        # Vega should be positive
        assert greeks['vega'] > 0, "Vega should be positive for long options"

    def test_american_vs_european_integration(self):
        """Test calculate_pl with American options"""
        positions = [
            {
                'qty': 1,
                'expiration': 'Jan 16',
                'strike': 100.0,
                'type': 'P',
                'style': 'American'
            }
        ]

        market_data = {
            'symbol': 'TEST',
            'current_price': 100.0,
            'implied_volatility': 0.25,
            'risk_free_rate': 0.045,
            'dividend_yield': 0.0
        }

        result = calculate_pl(
            positions=positions,
            credit=5.0,
            market_data=market_data,
            current_date=date(2024, 12, 16)
        )

        # Should have data
        assert 'data' in result
        assert len(result['data']) > 0

        # Should have Greeks
        assert 'positions_with_greeks' in result
        assert len(result['positions_with_greeks']) == 1

        # Check Greeks are calculated
        greeks = result['positions_with_greeks'][0]['greeks']
        assert 'delta' in greeks
        assert greeks['delta'] != 0.0  # Should have non-zero delta
