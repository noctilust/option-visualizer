#!/usr/bin/env python3
"""
Test script to demonstrate per-strike IV calculated from market prices
using Newton-Raphson Black-Scholes inversion.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from tastytrade_client import get_tastytrade_client
import httpx

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


async def test_tsla_iv_from_market_prices():
    """Fetch TSLA option market prices and calculate IV locally."""

    client = get_tastytrade_client()

    if not client.is_enabled:
        print("❌ Tastytrade credentials not configured")
        return

    symbol = "TSLA"

    print(f"\n{'='*70}")
    print(f"Calculating Per-Strike IV from TSLA Market Prices")
    print(f"Using Newton-Raphson Black-Scholes inversion")
    print(f"{'='*70}\n")

    # Get available expirations
    if not client._ensure_token():
        print("❌ Failed to get access token")
        return

    try:
        response = httpx.get(
            f"https://api.tastyworks.com/option-chains/{symbol}/nested",
            headers={"Authorization": f"Bearer {client._access_token}"},
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()

        items = data.get("data", {}).get("items", [])
        if not items:
            print("❌ No data found")
            return

        first_item = items[0]
        expirations = first_item.get("expirations", [])

        # Find an expiration 15-45 days out
        from market_data import MarketDataFetcher
        fetcher = MarketDataFetcher()

        target_exp = None
        target_exp_data = None

        for exp in expirations:
            exp_date_str = exp.get("expiration-date", "")
            if not exp_date_str or not exp.get("strikes"):
                continue

            try:
                exp_date = fetcher.parse_expiration_date(exp_date_str)
                dte = (exp_date - datetime.now().date()).days

                if 15 <= dte <= 45:
                    target_exp = exp_date_str
                    target_exp_data = exp
                    print(f"📅 Selected expiration: {exp_date_str} ({dte} DTE)")
                    break
            except Exception:
                continue

        if not target_exp_data:
            print("❌ No suitable expiration found")
            return

        # Get strikes from the selected expiration
        strikes = target_exp_data.get("strikes", [])

        # Select strikes to test (spread across the range)
        strike_prices = []
        for i, s in enumerate(strikes):
            sp = client._safe_float(s.get("strike-price"))
            if sp:
                strike_prices.append(int(sp))

        # Sample across the range
        sample_size = min(15, len(strike_prices))
        step = max(1, len(strike_prices) // sample_size)
        strikes_to_test = strike_prices[::step][:sample_size]

        print(f"Testing {len(strikes_to_test)} strikes...\n")

        print(f"{'='*70}")
        print(f"Per-Strike IV Calculated from Market Prices")
        print(f"{'='*70}\n")

        # Display header
        print(f"{'Strike':>8} | {'Call IV':>10} | {'Put IV':>10} | {'Call Delta':>12} | {'Put Delta':>12}")
        print(f"{'-'*70}")

        results = []

        for strike in strikes_to_test:
            # Fetch Call Greeks (with calculated IV)
            call_data = client.get_option_greeks(symbol, float(strike), target_exp, 'C')
            call_iv = call_data.get('implied_volatility') if call_data else None
            call_delta = call_data.get('delta') if call_data else None

            # Fetch Put Greeks (with calculated IV)
            put_data = client.get_option_greeks(symbol, float(strike), target_exp, 'P')
            put_iv = put_data.get('implied_volatility') if put_data else None
            put_delta = put_data.get('delta') if put_data else None

            if call_iv is not None or put_iv is not None:
                call_iv_str = f"{call_iv*100:.1f}%" if call_iv else "N/A"
                put_iv_str = f"{put_iv*100:.1f}%" if put_iv else "N/A"
                call_delta_str = f"{call_delta:.4f}" if call_delta is not None else "N/A"
                put_delta_str = f"{put_delta:.4f}" if put_delta is not None else "N/A"

                print(f"{strike:>8.0f} | {call_iv_str:>10} | {put_iv_str:>10} | {call_delta_str:>12} | {put_delta_str:>12}")

                results.append({
                    'strike': strike,
                    'call_iv': call_iv,
                    'put_iv': put_iv,
                    'call_delta': call_delta,
                    'put_delta': put_delta
                })

        print(f"\n{'='*70}")
        print("Volatility Skew Analysis")
        print(f"{'='*70}\n")

        # Analyze IV range
        call_ivs = [r['call_iv'] for r in results if r['call_iv'] is not None]
        put_ivs = [r['put_iv'] for r in results if r['put_iv'] is not None]

        if call_ivs:
            print(f"📈 Call IV Range: {min(call_ivs)*100:.1f}% - {max(call_ivs)*100:.1f}%")
            print(f"   Spread: {(max(call_ivs) - min(call_ivs))*100:.1f} percentage points")

        if put_ivs:
            print(f"📉 Put IV Range:  {min(put_ivs)*100:.1f}% - {max(put_ivs)*100:.1f}%")
            print(f"   Spread: {(max(put_ivs) - min(put_ivs))*100:.1f} percentage points")

        # Find ATM
        if results:
            atm_result = min(
                [r for r in results if r['call_delta'] is not None],
                key=lambda x: abs(x['call_delta'] - 0.5),
                default=results[len(results)//2]
            )

            if atm_result:
                call_iv_str = f"{atm_result['call_iv']*100:.1f}%" if atm_result['call_iv'] else "N/A"
                put_iv_str = f"{atm_result['put_iv']*100:.1f}%" if atm_result['put_iv'] else "N/A"
                print(f"\n🎯 ATM (~${atm_result['strike']:.0f}): Call IV={call_iv_str}, Put IV={put_iv_str}")

                # OTM comparison
                otm_calls = [r for r in results if r['strike'] > atm_result['strike'] and r['call_iv'] is not None]
                otm_puts = [r for r in results if r['strike'] < atm_result['strike'] and r['put_iv'] is not None]

                if otm_calls:
                    avg_otm_call_iv = sum(r['call_iv'] for r in otm_calls) / len(otm_calls)
                    print(f"📊 Avg OTM Call IV (higher strikes): {avg_otm_call_iv*100:.1f}%")

                if otm_puts:
                    avg_otm_put_iv = sum(r['put_iv'] for r in otm_puts) / len(otm_puts)
                    print(f"📊 Avg OTM Put IV (lower strikes):  {avg_otm_put_iv*100:.1f}%")

        print(f"\n{'='*70}")
        print("How It Works")
        print(f"{'='*70}")
        print(f"\n1️⃣  Fetch market price (bid/ask/mark) from Tastytrade/Yahoo Finance")
        print(f"2️⃣  Use Newton-Raphson iteration to solve for IV:")
        print(f"       IV_new = IV_old - (BS_price - market_price) / vega")
        print(f"3️⃣  Calculate Greeks using the derived IV")
        print(f"\n✅ Each strike has its OWN implied volatility derived from market price!")
        print(f"   This is TRUE volatility skew - not a single ATM IV for all strikes.")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_tsla_iv_from_market_prices())
