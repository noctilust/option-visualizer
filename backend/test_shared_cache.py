import json
import os
import uuid
from copy import deepcopy

import pytest

from shared_cache import (
    CacheTTL,
    SharedCache,
    build_cache_key,
    seconds_until_next_utc_day,
)


class InMemoryRedis:
    """Small redis-py-compatible boundary fake used by unit tests."""

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


def test_keys_are_versioned_normalized_and_do_not_expose_components():
    first = build_cache_key("symbol_search", {"query": " aapl "})
    second = build_cache_key("symbol_search", {"query": "AAPL"})

    assert first == second
    assert first.startswith("optionvis:v1:symbol_search:")
    assert "AAPL" not in first


def test_cache_ttls_match_the_public_configuration_contract():
    assert CacheTTL.SYMBOL_SEARCH == 3600
    assert CacheTTL.STOCK_PRICE == 30
    assert CacheTTL.MARKET_METRICS == 300
    assert CacheTTL.HISTORICAL_VOLATILITY == 21600
    assert CacheTTL.OPTION_CHAIN == 300
    assert CacheTTL.GREEKS == 300
    assert CacheTTL.VOLATILITY_SKEW == 300
    assert CacheTTL.NO_QUOTES == 45
    assert 0 < seconds_until_next_utc_day() <= 86400


def test_json_round_trip_returns_defensive_copies():
    redis = InMemoryRedis()
    cache = SharedCache(redis_client=redis, enabled=True)
    original = {"points": [{"strike": 100.0}]}

    assert cache.set_json("volatility_skew", {"symbol": "AAPL"}, original, 300)
    first = cache.get_json("volatility_skew", {"symbol": "AAPL"})
    first["points"][0]["strike"] = 999.0

    assert cache.get_json("volatility_skew", {"symbol": "AAPL"}) == original
    stored = next(iter(redis.values.values()))
    assert json.loads(stored) == original


def test_cache_errors_fail_open_without_exposing_credentials(caplog):
    class BrokenRedis:
        def get(self, _key):
            raise RuntimeError("AUTH failed password=top-secret")

        def set(self, *_args, **_kwargs):
            raise RuntimeError("AUTH failed password=top-secret")

        def close(self):
            raise RuntimeError("top-secret")

    cache = SharedCache(
        redis_client=BrokenRedis(),
        enabled=True,
    )

    assert cache.get_json("stock_price", {"symbol": "AAPL"}) is None
    assert not cache.set_json("stock_price", {"symbol": "AAPL"}, 123.45, 30)
    cache.close()

    assert "top-secret" not in caplog.text


def test_close_disconnects_an_explicit_connection_pool():
    class Pool:
        def __init__(self):
            self.disconnected = False

        def disconnect(self):
            self.disconnected = True

    class Client:
        def __init__(self):
            self.connection_pool = Pool()
            self.closed = False

        def close(self):
            self.closed = True

    client = Client()
    cache = SharedCache(redis_client=client, enabled=True)

    cache.close()

    assert client.closed
    assert client.connection_pool.disconnected


def test_fill_lease_owner_and_contender_behavior():
    redis = InMemoryRedis()
    owner = SharedCache(redis_client=redis, enabled=True)
    contender = SharedCache(redis_client=redis, enabled=True)
    components = {"symbol": "AAPL"}

    assert owner.acquire_fill_lease("option_chain", components)
    assert not contender.acquire_fill_lease("option_chain", components)

    value = {"expirations": ["2026-08-21"]}
    assert owner.set_json("option_chain", components, deepcopy(value), 300)
    assert contender.wait_for_json("option_chain", components, timeout_seconds=0.01) == value


@pytest.mark.integration
def test_blocking_pool_round_trip_against_valkey():
    host = os.getenv("TEST_VALKEY_HOST")
    if not host:
        pytest.skip("TEST_VALKEY_HOST is only configured by backend CI")

    import redis

    pool = redis.BlockingConnectionPool(
        host=host,
        port=int(os.getenv("TEST_VALKEY_PORT", "6379")),
        max_connections=2,
        timeout=0.1,
        socket_connect_timeout=0.2,
        socket_timeout=0.2,
        decode_responses=True,
    )
    client = redis.Redis(connection_pool=pool)
    cache = SharedCache(redis_client=client, enabled=True)
    components = {"test_id": str(uuid.uuid4())}
    data_key = build_cache_key("integration", components)
    lease_key = build_cache_key("lease:integration", components)

    try:
        assert cache.set_json("integration", components, {"ready": True}, 30)
        assert cache.get_json("integration", components) == {"ready": True}
        assert cache.acquire_fill_lease("integration", components)
    finally:
        client.delete(data_key, lease_key)
        cache.close()
