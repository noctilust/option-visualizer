import inspect
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import httpx

import tastytrade_client as tastytrade_module
from main import get_option_chain as get_option_chain_route
from main import get_volatility_skew
from shared_cache import SharedCache, build_cache_key
from tastytrade_client import TastytradeClient


class FakeHttpClient:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        status_code, headers, payload = self.responses.pop(0)
        return httpx.Response(
            status_code,
            headers=headers,
            json=payload,
            request=httpx.Request(method, url),
        )


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


def usable_smile(iv=0.25):
    return {
        "points": [
            {
                "strike": 100,
                "call_iv": iv,
                "put_iv": iv + 0.02,
                "call_delta": 0.25,
                "put_delta": -0.25,
            }
        ],
        "atm_iv": iv + 0.01,
        "skew_metric": 0.02,
        "skew_basis": "25_delta",
        "call_selection": {"strike": 100, "delta": 0.25, "iv": iv},
        "put_selection": {"strike": 100, "delta": -0.25, "iv": iv + 0.02},
    }


def test_volatility_skew_route_runs_in_fastapi_threadpool():
    assert not inspect.iscoroutinefunction(get_volatility_skew)
    assert not inspect.iscoroutinefunction(get_option_chain_route)


def test_whole_skew_cache_deduplicates_concurrent_requests(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    started = threading.Event()
    release = threading.Event()
    fetch_count = 0

    def fetch_smile(symbol, expiration, current_price):
        nonlocal fetch_count
        fetch_count += 1
        started.set()
        assert release.wait(timeout=2)
        return usable_smile()

    monkeypatch.setattr(client, "_fetch_volatility_smile", fetch_smile)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_future = executor.submit(
            client.get_volatility_smile, "tsla", "2026-08-21", 325.0
        )
        assert started.wait(timeout=2)
        second_future = executor.submit(
            client.get_volatility_smile, "TSLA", "2026-08-21", 325.0
        )
        release.set()
        first = first_future.result(timeout=2)
        second = second_future.result(timeout=2)

    assert fetch_count == 1
    assert first == second == usable_smile()

    first["points"][0]["call_iv"] = 9.99
    cached = client.get_volatility_smile("TSLA", "2026-08-21", 325.0)
    assert fetch_count == 1
    assert cached["points"][0]["call_iv"] == 0.25


def test_empty_provider_result_is_not_cached(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    fetch_count = 0

    def failed_fetch(symbol, expiration, current_price):
        nonlocal fetch_count
        fetch_count += 1
        return client._empty_volatility_smile(current_price)

    monkeypatch.setattr(client, "_fetch_volatility_smile", failed_fetch)

    first = client.get_volatility_smile("AAPL", "2026-08-21", 215.0)
    second = client.get_volatility_smile("AAPL", "2026-08-21", 215.0)

    assert first["points"] == second["points"] == []
    assert fetch_count == 2
    assert client._skew_cache == {}


def test_skew_result_is_shared_across_instances_and_repopulates_l1(monkeypatch):
    redis = InMemoryRedis()
    first = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    fetch_count = 0

    def fetch_smile(symbol, expiration, current_price):
        nonlocal fetch_count
        fetch_count += 1
        return usable_smile()

    monkeypatch.setattr(first, "_fetch_volatility_smile", fetch_smile)
    monkeypatch.setattr(second, "_fetch_volatility_smile", fetch_smile)

    assert first.get_volatility_smile("AAPL", "2026-08-21", 215.0) == usable_smile()
    assert second.get_volatility_smile("AAPL", "2026-08-21", 215.0) == usable_smile()
    assert fetch_count == 1
    assert redis.expirations[
        build_cache_key(
            "volatility_skew",
            {
                "symbol": "AAPL",
                "expiration": "2026-08-21",
                "spot": 215.0,
            },
        )
    ] == 300

    redis.values.clear()
    cached = second.get_volatility_smile("AAPL", "2026-08-21", 215.0)
    cached["points"][0]["call_iv"] = 9.99
    assert fetch_count == 1
    assert second.get_volatility_smile(
        "AAPL", "2026-08-21", 215.0
    )["points"][0]["call_iv"] == 0.25


def test_provider_error_is_not_stored_in_shared_cache(monkeypatch):
    redis = InMemoryRedis()
    shared = SharedCache(redis_client=redis, enabled=True)
    client = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=shared,
    )
    monkeypatch.setattr(
        client,
        "_fetch_volatility_smile",
        lambda symbol, expiration, current_price: client._empty_volatility_smile(
            current_price
        ),
    )

    client.get_volatility_smile("AAPL", "2026-08-21", 215.0)

    assert build_cache_key(
        "volatility_skew",
        {"symbol": "AAPL", "expiration": "2026-08-21", "spot": 215.0},
    ) not in redis.values


def test_malformed_shared_skew_is_treated_as_a_miss(monkeypatch):
    redis = InMemoryRedis()
    components = {
        "symbol": "AAPL",
        "expiration": "2026-08-21",
        "spot": 215.0,
    }
    redis.values[
        build_cache_key("volatility_skew", components)
    ] = json.dumps({"unexpected": "shape"})
    client = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    fetched = 0

    def fetch_smile(symbol, expiration, current_price):
        nonlocal fetched
        fetched += 1
        return usable_smile()

    monkeypatch.setattr(client, "_fetch_volatility_smile", fetch_smile)

    assert client.get_volatility_smile(
        "AAPL", "2026-08-21", 215.0
    ) == usable_smile()
    assert fetched == 1


def test_malformed_shared_skew_point_is_treated_as_a_miss(monkeypatch):
    redis = InMemoryRedis()
    components = {
        "symbol": "AAPL",
        "expiration": "2026-08-21",
        "spot": 215.0,
    }
    redis.values[
        build_cache_key("volatility_skew", components)
    ] = json.dumps(
        {
            "points": [1],
            "atm_iv": 0.25,
            "skew_metric": 0.02,
            "skew_basis": "25_delta",
        }
    )
    client = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    fetched = 0

    def fetch_smile(symbol, expiration, current_price):
        nonlocal fetched
        fetched += 1
        return usable_smile()

    monkeypatch.setattr(client, "_fetch_volatility_smile", fetch_smile)

    assert client.get_volatility_smile(
        "AAPL", "2026-08-21", 215.0
    ) == usable_smile()
    assert fetched == 1


def test_no_quote_cycle_is_negative_cached_for_45_seconds(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    client._skew_negative_cache_ttl_seconds = 45
    fetch_count = 0
    now = 1_000.0

    def fetch_without_quotes(symbol, expiration, current_price):
        nonlocal fetch_count
        fetch_count += 1
        return client._empty_volatility_smile(
            current_price,
            data_status="no_quotes",
        )

    monkeypatch.setattr(client, "_fetch_volatility_smile", fetch_without_quotes)
    monkeypatch.setattr(tastytrade_module.time, "monotonic", lambda: now)

    first = client.get_volatility_smile("TSLA", "2026-08-10", 325.0)
    now += 44.999
    second = client.get_volatility_smile("TSLA", "2026-08-10", 325.0)

    assert first == second
    assert first["data_status"] == "no_quotes"
    assert fetch_count == 1

    now += 0.002
    third = client.get_volatility_smile("TSLA", "2026-08-10", 325.0)

    assert third["data_status"] == "no_quotes"
    assert fetch_count == 2


def test_shared_no_quotes_result_uses_negative_ttl(monkeypatch):
    redis = InMemoryRedis()
    client = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    monkeypatch.setattr(
        client,
        "_fetch_volatility_smile",
        lambda symbol, expiration, current_price: client._empty_volatility_smile(
            current_price,
            data_status="no_quotes",
        ),
    )

    client.get_volatility_smile("TSLA", "2026-08-10", 325.0)

    key = build_cache_key(
        "volatility_skew",
        {"symbol": "TSLA", "expiration": "2026-08-10", "spot": 325.0},
    )
    assert redis.expirations[key] == 45


def test_skew_cache_does_not_reuse_a_different_spot_price(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    fetched_prices = []

    def fetch_smile(symbol, expiration, current_price):
        fetched_prices.append(current_price)
        return usable_smile(current_price / 1000)

    monkeypatch.setattr(client, "_fetch_volatility_smile", fetch_smile)

    client.get_volatility_smile("NVDA", "2026-08-21", 180.0)
    client.get_volatility_smile("NVDA", "2026-08-21", 181.0)

    assert fetched_prices == [180.0, 181.0]


def test_whole_skew_cache_evicts_least_recently_used_entry(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    client._skew_cache_max_entries = 2
    monkeypatch.setattr(
        client,
        "_fetch_volatility_smile",
        lambda symbol, expiration, current_price: usable_smile(
            int(expiration[-2:]) / 100
        ),
    )

    client.get_volatility_smile("SPY", "2026-08-21", 625.0)
    client.get_volatility_smile("SPY", "2026-09-18", 625.0)
    client.get_volatility_smile("SPY", "2026-10-16", 625.0)

    assert list(client._skew_cache) == [
        ("SPY", "2026-09-18", 625.0),
        ("SPY", "2026-10-16", 625.0),
    ]


def test_request_retries_429_using_bounded_retry_after(monkeypatch):
    fake_http = FakeHttpClient(
        [
            (429, {"Retry-After": "2.5"}, {"error": "rate limited"}),
            (200, {"X-RateLimit-Remaining": "9"}, {"data": {}}),
        ]
    )
    client = TastytradeClient(http_client=fake_http)
    client._request_min_interval_seconds = 0
    client._rate_limit_retries = 1
    client._rate_limit_max_delay_seconds = 10
    sleeps = []

    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)
    monkeypatch.setattr(tastytrade_module.time, "sleep", sleeps.append)

    response = client._request("GET", "https://example.test/market-data")

    assert response.status_code == 200
    assert len(fake_http.calls) == 2
    assert sleeps == [2.5]


def test_concurrent_token_checks_share_one_refresh(monkeypatch):
    fake_http = FakeHttpClient(
        [
            (
                200,
                {},
                {"access_token": "shared-token", "expires_in": 900},
            )
        ]
    )
    monkeypatch.setenv("TASTYTRADE_CLIENT_SECRET", "secret")
    monkeypatch.setenv("TASTYTRADE_REFRESH_TOKEN", "refresh")
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)
    client = TastytradeClient(http_client=fake_http)
    client._request_min_interval_seconds = 0

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: client._ensure_token(), range(2)))

    assert results == [True, True]
    assert client._access_token == "shared-token"
    assert len(fake_http.calls) == 1


def test_request_does_not_retry_before_large_retry_after(monkeypatch):
    fake_http = FakeHttpClient(
        [
            (429, {"Retry-After": "120"}, {"error": "rate limited"}),
            (200, {}, {"data": {}}),
        ]
    )
    client = TastytradeClient(http_client=fake_http)
    client._request_min_interval_seconds = 0
    client._rate_limit_retries = 1
    client._rate_limit_max_delay_seconds = 3
    sleeps = []

    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)
    monkeypatch.setattr(tastytrade_module.time, "sleep", sleeps.append)

    response = client._request("GET", "https://example.test/market-data")

    assert response.status_code == 429
    assert len(fake_http.calls) == 1
    assert sleeps == []


def test_option_chain_uses_single_nested_request(monkeypatch):
    nested_payload = {
        "data": {
            "underlying-price": "325.50",
            "items": [
                {
                    "root-symbol": "TSLA",
                    "expirations": [
                        {
                            "expiration-date": "2026-08-21",
                            "strikes": [
                                {"strike-price": "320.0"},
                                {"strike-price": "325.0"},
                            ],
                        },
                        {
                            "expiration-date": "2026-09-18T00:00:00+0000",
                            "strikes": [
                                {"strike-price": "325.0"},
                                {"strike-price": "330.0"},
                            ],
                        },
                    ],
                }
            ],
        }
    }
    fake_http = FakeHttpClient([(200, {}, nested_payload)])
    client = TastytradeClient(http_client=fake_http)
    client._access_token = "token"
    client._token_expiry = datetime.now() + timedelta(minutes=10)
    client._request_min_interval_seconds = 0
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)

    result = client.get_option_chain("TSLA")

    assert result == {
        "expirations": ["2026-08-21", "2026-09-18"],
        "strikes_by_expiration": {
            "2026-08-21": [320.0, 325.0],
            "2026-09-18": [325.0, 330.0],
        },
        "underlying_price": 325.5,
    }
    result["expirations"].append("2099-01-16")
    cached = client.get_option_chain("tsla")

    assert len(fake_http.calls) == 1
    assert fake_http.calls[0][1].endswith("/option-chains/TSLA/nested")
    assert cached["expirations"] == ["2026-08-21", "2026-09-18"]


def test_option_chain_is_shared_across_instances(monkeypatch):
    payload = {
        "data": {
            "items": [
                {
                    "expirations": [
                        {
                            "expiration-date": "2026-08-21",
                            "strikes": [{"strike-price": "100"}],
                        }
                    ]
                }
            ]
        }
    }
    redis = InMemoryRedis()
    first_http = FakeHttpClient([(200, {}, payload)])
    second_http = FakeHttpClient()
    first = TastytradeClient(
        http_client=first_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=second_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    for client in (first, second):
        client._access_token = "token"
        client._token_expiry = datetime.now() + timedelta(minutes=10)
        client._request_min_interval_seconds = 0
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)

    expected = first.get_option_chain("AAPL")
    actual = second.get_option_chain("aapl")

    assert actual == expected
    assert len(first_http.calls) == 1
    assert second_http.calls == []
    assert redis.expirations[
        build_cache_key("option_chain", {"symbol": "AAPL"})
    ] == 300


def test_volatility_smile_uses_exact_requested_expiration(monkeypatch):
    client = TastytradeClient(http_client=FakeHttpClient())
    requested_expiration = "2026-08-28"
    captured_positions = []

    monkeypatch.setattr(client, "_ensure_token", lambda: True)
    monkeypatch.setattr(
        client, "_generate_strikes_around_price", lambda current_price: [100.0]
    )

    def get_batch(positions):
        captured_positions.extend(positions)
        return {}

    monkeypatch.setattr(client, "get_batch_option_greeks", get_batch)
    monkeypatch.setattr(
        client,
        "get_option_greeks",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("expiration probing should not run")
        ),
    )

    client._fetch_volatility_smile("SPY", requested_expiration, 100.0)

    assert captured_positions
    assert {
        position["expiration_date"] for position in captured_positions
    } == {requested_expiration}


def test_greeks_cache_is_bounded_lru_and_returns_defensive_copies():
    client = TastytradeClient(http_client=FakeHttpClient())
    client._greeks_cache_max_entries = 2

    client._cache_greeks("first", {"delta": 0.1})
    client._cache_greeks("second", {"delta": 0.2})
    first = client._get_cached_greeks("first")
    assert first == {"delta": 0.1}

    first["delta"] = 9.9
    client._cache_greeks("third", {"delta": 0.3})

    assert list(client._greeks_cache) == ["first", "third"]
    assert client._get_cached_greeks("first") == {"delta": 0.1}


def test_market_metrics_are_shared_across_instances(monkeypatch):
    payload = {
        "data": {
            "items": [
                {
                    "implied-volatility-index-rank": "0.42",
                    "implied-volatility-percentile": "0.55",
                    "implied-volatility-index": "0.27",
                    "beta": "1.1",
                    "liquidity-rating": "4",
                }
            ]
        }
    }
    redis = InMemoryRedis()
    first_http = FakeHttpClient([(200, {}, payload)])
    second_http = FakeHttpClient()
    first = TastytradeClient(
        http_client=first_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=second_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    for client in (first, second):
        client._access_token = "token"
        client._token_expiry = datetime.now() + timedelta(minutes=10)
        client._request_min_interval_seconds = 0
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)

    expected = first.get_market_metrics("AAPL")
    actual = second.get_market_metrics("aapl")

    assert actual == expected
    assert len(first_http.calls) == 1
    assert second_http.calls == []
    assert redis.expirations[
        build_cache_key("market_metrics", {"symbol": "AAPL"})
    ] == 300


def test_nonempty_symbol_search_results_are_shared(monkeypatch):
    payload = {
        "data": {
            "items": [
                {
                    "instrument-type": "Equity",
                    "symbol": "AAPL",
                    "description": "Apple Inc.",
                    "listed-market": "NASDAQ",
                    "etf": False,
                }
            ]
        }
    }
    redis = InMemoryRedis()
    first_http = FakeHttpClient([(200, {}, payload)])
    second_http = FakeHttpClient()
    first = TastytradeClient(
        http_client=first_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=second_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    for client in (first, second):
        client._access_token = "token"
        client._token_expiry = datetime.now() + timedelta(minutes=10)
        client._request_min_interval_seconds = 0
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)

    expected = first.search_symbols(" apple ")
    actual = second.search_symbols("APPLE")

    assert actual == expected
    assert len(first_http.calls) == 1
    assert second_http.calls == []
    assert redis.expirations[
        build_cache_key("symbol_search", {"query": "APPLE"})
    ] == 3600


def test_verified_yahoo_symbol_fallback_is_shared(monkeypatch):
    redis = InMemoryRedis()
    expected = [
        {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "type": "EQUITY",
        }
    ]
    first = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    monkeypatch.setattr(first, "_ensure_token", lambda: False)
    monkeypatch.setattr(second, "_ensure_token", lambda: False)
    monkeypatch.setattr(
        first,
        "_search_symbols_fallback_result",
        lambda query: (expected, True),
    )
    monkeypatch.setattr(
        second,
        "_search_symbols_fallback_result",
        lambda query: (_ for _ in ()).throw(
            AssertionError("shared result should avoid Yahoo")
        ),
    )

    assert first.search_symbols("aapl") == expected
    assert second.search_symbols("AAPL") == expected
    assert redis.expirations[
        build_cache_key("symbol_search", {"query": "AAPL"})
    ] == 3600


def test_error_derived_symbol_fallback_is_not_cached(monkeypatch):
    redis = InMemoryRedis()
    synthetic = [
        {
            "symbol": "AAPL",
            "name": "AAPL",
            "exchange": "Unknown",
            "type": "EQUITY",
        }
    ]
    client = TastytradeClient(
        http_client=FakeHttpClient(),
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    monkeypatch.setattr(client, "_ensure_token", lambda: False)
    monkeypatch.setattr(
        client,
        "_search_symbols_fallback_result",
        lambda query: (synthetic, False),
    )

    assert client.search_symbols("AAPL") == synthetic
    assert build_cache_key(
        "symbol_search", {"query": "AAPL"}
    ) not in redis.values


def test_available_greeks_are_shared_by_normalized_osi_contract(monkeypatch):
    payload = {
        "data": {
            "items": [
                {
                    "delta": "0.51",
                    "gamma": "0.02",
                    "theta": "-0.1",
                    "vega": "0.2",
                    "rho": "0.03",
                    "volatility": "0.25",
                }
            ]
        }
    }
    redis = InMemoryRedis()
    first_http = FakeHttpClient([(200, {}, payload)])
    second_http = FakeHttpClient()
    first = TastytradeClient(
        http_client=first_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    second = TastytradeClient(
        http_client=second_http,
        shared_cache=SharedCache(redis_client=redis, enabled=True),
    )
    for client in (first, second):
        client._access_token = "token"
        client._token_expiry = datetime.now() + timedelta(minutes=10)
        client._request_min_interval_seconds = 0
    monkeypatch.setattr(tastytrade_module, "_NEXT_REQUEST_AT", 0.0)

    expected = first.get_option_greeks(
        " aapl ", 200.0, "2026-08-21", "c"
    )
    actual = second.get_option_greeks(
        "AAPL", 200, "2026-08-21", "C"
    )

    assert actual == expected
    assert len(first_http.calls) == 1
    assert second_http.calls == []
    osi = first._to_osi_symbol("AAPL", "2026-08-21", 200, "C")
    assert redis.expirations[
        build_cache_key("greeks", {"osi": osi})
    ] == 300
