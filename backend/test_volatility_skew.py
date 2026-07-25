import pytest

from tastytrade_client import summarize_volatility_skew


def test_skew_summary_uses_the_options_closest_to_25_delta():
    points = [
        {"strike": 90, "call_iv": 0.21, "put_iv": 0.32, "call_delta": 0.30, "put_delta": -0.20},
        {"strike": 95, "call_iv": 0.22, "put_iv": 0.31, "call_delta": 0.26, "put_delta": -0.24},
        {"strike": 100, "call_iv": 0.23, "put_iv": 0.30, "call_delta": 0.20, "put_delta": -0.30},
    ]

    summary = summarize_volatility_skew(points, current_price=95)

    assert summary == {
        "skew_metric": pytest.approx(0.09),
        "skew_basis": "25_delta",
        "call_selection": {"strike": 95, "delta": 0.26, "iv": 0.22},
        "put_selection": {"strike": 95, "delta": -0.24, "iv": 0.31},
    }


def test_skew_summary_labels_nearest_strike_as_atm_when_25_delta_pair_is_missing():
    points = [
        {"strike": 95, "call_iv": 0.26, "put_iv": 0.35, "call_delta": 0.65, "put_delta": -0.35},
        {"strike": 101, "call_iv": 0.24, "put_iv": 0.32, "call_delta": 0.52, "put_delta": -0.48},
        {"strike": 105, "call_iv": 0.25, "put_iv": 0.33, "call_delta": 0.35, "put_delta": -0.65},
    ]

    summary = summarize_volatility_skew(points, current_price=100)

    assert summary == {
        "skew_metric": pytest.approx(0.08),
        "skew_basis": "atm",
        "call_selection": {"strike": 101, "delta": 0.52, "iv": 0.24},
        "put_selection": {"strike": 101, "delta": -0.48, "iv": 0.32},
    }


def test_skew_summary_is_unavailable_when_only_paired_iv_is_far_from_atm():
    points = [
        {"strike": 70, "call_iv": 0.28, "put_iv": 0.40, "call_delta": 0.80, "put_delta": -0.20},
    ]

    summary = summarize_volatility_skew(points, current_price=100)

    assert summary == {
        "skew_metric": None,
        "skew_basis": "unavailable",
        "call_selection": None,
        "put_selection": None,
    }
