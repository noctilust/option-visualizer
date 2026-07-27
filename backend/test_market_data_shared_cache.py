import market_data as market_data_module
import pandas as pd
from market_data import MarketDataFetcher
from shared_cache import SharedCache, build_cache_key


class InMemoryRedis:
    def __init__(self):
        self.values = {}
        self.expirations = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        self.expirations[key] = ex
        return True

    def close(self):
        return None


class DisabledTastytrade:
    is_enabled = False


def test_stock_price_is_shared_for_30_seconds_and_repopulates_l1(monkeypatch):
    calls = 0

    class FakeTicker:
        fast_info = {"last_price": 215.25}

    def ticker(_symbol):
        nonlocal calls
        calls += 1
        return FakeTicker()

    monkeypatch.setattr(market_data_module.yf, "Ticker", ticker)
    redis = InMemoryRedis()
    first = MarketDataFetcher(
        shared_cache=SharedCache(redis_client=redis, enabled=True),
        tastytrade_client=DisabledTastytrade(),
    )
    second = MarketDataFetcher(
        shared_cache=SharedCache(redis_client=redis, enabled=True),
        tastytrade_client=DisabledTastytrade(),
    )

    assert first.get_stock_price(" aapl ") == 215.25
    assert second.get_stock_price("AAPL") == 215.25
    assert calls == 1

    key = build_cache_key("stock_price", {"symbol": "AAPL"})
    assert redis.expirations[key] == 30

    redis.values.clear()
    assert second.get_stock_price("AAPL") == 215.25
    assert calls == 1


def test_risk_free_rate_uses_utc_day_ttl_and_does_not_cache_default(monkeypatch):
    class WorkingTicker:
        fast_info = {"last_price": 4.5}

    redis = InMemoryRedis()
    cache = SharedCache(redis_client=redis, enabled=True)
    fetcher = MarketDataFetcher(
        shared_cache=cache,
        tastytrade_client=DisabledTastytrade(),
    )
    monkeypatch.setattr(
        market_data_module.yf, "Ticker", lambda _symbol: WorkingTicker()
    )

    assert fetcher.get_risk_free_rate() == 0.045
    key = build_cache_key("risk_free_rate", {"source": "TNX"})
    assert 0 < redis.expirations[key] <= 86400

    class BrokenTicker:
        def __init__(self):
            raise RuntimeError("provider unavailable")

    redis.values.clear()
    redis.expirations.clear()
    fallback_fetcher = MarketDataFetcher(
        shared_cache=cache,
        tastytrade_client=DisabledTastytrade(),
    )
    monkeypatch.setattr(
        market_data_module.yf, "Ticker", lambda _symbol: BrokenTicker()
    )

    assert fallback_fetcher.get_risk_free_rate() == 0.045
    assert key not in redis.values
    assert "risk_free_rate" not in fallback_fetcher._cache


def test_historical_volatility_is_shared_for_six_hours(monkeypatch):
    class FakeTicker:
        def history(self, period):
            assert period == "25d"
            return pd.DataFrame(
                {
                    "Close": [
                        100 + index + (0.5 if index % 2 else 0)
                        for index in range(25)
                    ]
                }
            )

    monkeypatch.setattr(
        market_data_module.yf, "Ticker", lambda _symbol: FakeTicker()
    )
    redis = InMemoryRedis()
    fetcher = MarketDataFetcher(
        shared_cache=SharedCache(redis_client=redis, enabled=True),
        tastytrade_client=DisabledTastytrade(),
    )

    assert fetcher.calculate_historical_volatility("AAPL", days=20) > 0
    key = build_cache_key(
        "historical_volatility", {"symbol": "AAPL", "days": 20}
    )
    assert redis.expirations[key] == 21600
