"""One-shot Cloud Run job used to verify private Valkey connectivity and AUTH."""

import os
import secrets

import redis


def main() -> None:
    client = redis.Redis(
        host=os.environ["VALKEY_HOST"],
        port=int(os.getenv("VALKEY_PORT", "6379")),
        username=os.getenv("VALKEY_USERNAME", "default"),
        password=os.environ["VALKEY_PASSWORD"],
        socket_connect_timeout=1.0,
        socket_timeout=1.0,
        decode_responses=True,
    )
    probe_key = f"optionvis:v1:probe:{secrets.token_hex(8)}"
    try:
        if not client.ping():
            raise RuntimeError("Valkey PING did not return success")
        if os.getenv("CACHE_PROBE_FLUSH", "").strip().lower() == "true":
            client.flushdb()
            print("Dedicated Valkey cache cleared for rollout verification")
        client.set(probe_key, "ok", ex=30)
        if client.get(probe_key) != "ok":
            raise RuntimeError("Valkey authenticated round trip failed")
        print("Valkey private connectivity and token authentication verified")
    finally:
        try:
            client.delete(probe_key)
        finally:
            client.close()


if __name__ == "__main__":
    main()
