"""Fail-open shared JSON cache for Google Cloud Memorystore for Valkey."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from copy import deepcopy
from datetime import datetime, time as datetime_time, timedelta, timezone
from enum import IntEnum
from typing import Any, Mapping, Protocol

logger = logging.getLogger(__name__)

CACHE_NAMESPACE = "optionvis"
CACHE_VERSION = "v1"


class CacheTTL(IntEnum):
    SYMBOL_SEARCH = 60 * 60
    STOCK_PRICE = 30
    MARKET_METRICS = 5 * 60
    HISTORICAL_VOLATILITY = 6 * 60 * 60
    OPTION_CHAIN = 5 * 60
    GREEKS = 5 * 60
    VOLATILITY_SKEW = 5 * 60
    NO_QUOTES = 45


class RedisClient(Protocol):
    def get(self, key: str) -> Any: ...

    def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool = False,
    ) -> Any: ...

    def close(self) -> Any: ...


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid shared-cache setting %s; using default", name)
        return default


def _env_float(name: str, default: float, minimum: float = 0.01) -> float:
    try:
        return max(minimum, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid shared-cache setting %s; using default", name)
        return default


def _normalize_component(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip().upper()
    if isinstance(value, Mapping):
        return {
            str(key).strip().lower(): _normalize_component(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_normalize_component(item) for item in value]
    if isinstance(value, float):
        return round(value, 8)
    return value


def build_cache_key(dataset: str, components: Mapping[str, Any]) -> str:
    """Build a stable versioned key without exposing user input in Redis keys."""
    normalized_dataset = dataset.strip().lower().replace(" ", "_")
    canonical = json.dumps(
        _normalize_component(components),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{CACHE_NAMESPACE}:{CACHE_VERSION}:{normalized_dataset}:{digest}"


def seconds_until_next_utc_day(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    next_day = datetime.combine(
        current.date() + timedelta(days=1),
        datetime_time.min,
        tzinfo=timezone.utc,
    )
    return max(1, int((next_day - current).total_seconds()))


class SharedCache:
    """A small fail-open boundary around a redis-py compatible client."""

    def __init__(
        self,
        redis_client: RedisClient | None = None,
        *,
        enabled: bool = False,
        lease_ttl_seconds: int = 5,
        poll_interval_seconds: float = 0.05,
    ):
        self._client = redis_client
        self.enabled = enabled and redis_client is not None
        self._lease_ttl_seconds = max(1, lease_ttl_seconds)
        self._poll_interval_seconds = max(0.001, poll_interval_seconds)

    def _record(
        self,
        dataset: str,
        event: str,
        started_at: float,
        *,
        fallback: bool = False,
    ) -> None:
        logger.info(
            "cache_event dataset=%s event=%s latency_ms=%.2f fallback=%s",
            dataset,
            event,
            (time.monotonic() - started_at) * 1000,
            str(fallback).lower(),
        )

    def _error(self, dataset: str, operation: str, started_at: float) -> None:
        # Intentionally omit exception text: Redis authentication failures can
        # echo credentials and raw cache keys can contain sensitive inputs.
        self._record(dataset, f"{operation}_error", started_at, fallback=True)

    def get_json(
        self, dataset: str, components: Mapping[str, Any]
    ) -> Any | None:
        if not self.enabled or self._client is None:
            return None
        started_at = time.monotonic()
        try:
            raw_value = self._client.get(build_cache_key(dataset, components))
            if raw_value is None:
                self._record(dataset, "miss", started_at)
                return None
            if isinstance(raw_value, bytes):
                raw_value = raw_value.decode("utf-8")
            value = json.loads(raw_value)
            self._record(dataset, "hit", started_at)
            return deepcopy(value)
        except Exception:
            self._error(dataset, "read", started_at)
            return None

    def set_json(
        self,
        dataset: str,
        components: Mapping[str, Any],
        value: Any,
        ttl_seconds: int,
    ) -> bool:
        if not self.enabled or self._client is None:
            return False
        started_at = time.monotonic()
        try:
            serialized = json.dumps(
                deepcopy(value),
                separators=(",", ":"),
                allow_nan=False,
            )
            self._client.set(
                build_cache_key(dataset, components),
                serialized,
                ex=max(1, int(ttl_seconds)),
            )
            self._record(dataset, "store", started_at)
            return True
        except Exception:
            self._error(dataset, "write", started_at)
            return False

    def acquire_fill_lease(
        self, dataset: str, components: Mapping[str, Any]
    ) -> bool:
        if not self.enabled or self._client is None:
            return True
        started_at = time.monotonic()
        lease_key = build_cache_key(f"lease:{dataset}", components)
        try:
            acquired = bool(
                self._client.set(
                    lease_key,
                    "1",
                    ex=self._lease_ttl_seconds,
                    nx=True,
                )
            )
            self._record(
                dataset,
                "fill_lease_acquired" if acquired else "fill_lease_contention",
                started_at,
            )
            return acquired
        except Exception:
            self._error(dataset, "fill_lease", started_at)
            return True

    def wait_for_json(
        self,
        dataset: str,
        components: Mapping[str, Any],
        *,
        timeout_seconds: float = 0.3,
    ) -> Any | None:
        deadline = time.monotonic() + max(0.0, timeout_seconds)
        while True:
            value = self.get_json(dataset, components)
            if value is not None:
                return value
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            time.sleep(min(self._poll_interval_seconds, remaining))

    def record_provider_fetch(self, dataset: str) -> None:
        logger.info("cache_event dataset=%s event=provider_fetch", dataset)

    def record_fallback(self, dataset: str) -> None:
        logger.info(
            "cache_event dataset=%s event=fallback fallback=true", dataset
        )

    def close(self) -> None:
        if self._client is None:
            return
        started_at = time.monotonic()
        connection_pool = getattr(self._client, "connection_pool", None)
        try:
            self._client.close()
        except Exception:
            self._error("connection_pool", "client_close", started_at)
        if connection_pool is not None:
            try:
                connection_pool.disconnect()
            except Exception:
                self._error("connection_pool", "pool_close", started_at)


def _create_shared_cache_from_environment() -> SharedCache:
    enabled = _env_bool("SHARED_CACHE_ENABLED", False)
    if not enabled:
        return SharedCache()

    host = os.getenv("VALKEY_HOST", "").strip()
    password = os.getenv("VALKEY_PASSWORD", "")
    if not host or not password:
        logger.warning(
            "Shared cache requested but host or password is missing; continuing without L2"
        )
        return SharedCache()

    try:
        import redis
        from redis.backoff import ExponentialBackoff
        from redis.retry import Retry

        connect_timeout = _env_float(
            "VALKEY_CONNECT_TIMEOUT_SECONDS", 0.2
        )
        socket_timeout = _env_float(
            "VALKEY_SOCKET_TIMEOUT_SECONDS", 0.2
        )
        pool = redis.BlockingConnectionPool(
            host=host,
            port=_env_int("VALKEY_PORT", 6379),
            username=os.getenv("VALKEY_USERNAME", "default"),
            password=password,
            max_connections=_env_int("VALKEY_MAX_CONNECTIONS", 20),
            timeout=socket_timeout,
            socket_connect_timeout=connect_timeout,
            socket_timeout=socket_timeout,
            decode_responses=True,
            health_check_interval=30,
            retry=Retry(ExponentialBackoff(cap=0.1, base=0.02), 1),
            retry_on_timeout=False,
        )
        client = redis.Redis(connection_pool=pool)
        logger.info(
            "Shared cache enabled host_configured=true max_connections=%s",
            pool.max_connections,
        )
        return SharedCache(
            redis_client=client,
            enabled=True,
        )
    except Exception:
        logger.warning(
            "Shared cache initialization failed; continuing without L2"
        )
        return SharedCache()


_shared_cache: SharedCache | None = None
_shared_cache_lock = threading.Lock()


def get_shared_cache() -> SharedCache:
    global _shared_cache
    if _shared_cache is None:
        with _shared_cache_lock:
            if _shared_cache is None:
                _shared_cache = _create_shared_cache_from_environment()
    return _shared_cache


def close_shared_cache() -> None:
    global _shared_cache
    with _shared_cache_lock:
        cache = _shared_cache
        _shared_cache = None
    if cache is not None:
        cache.close()
