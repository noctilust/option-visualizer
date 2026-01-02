# Per-Strike Implied Volatility (IV) Implementation

## Summary

Tastytrade's REST API `/market-data` endpoint provides per-strike option quotes with complete Greeks and IV data. This enables accurate P/L calculations using volatility smile/skew instead of a single ATM IV for all positions.

**Date Implemented:** 2026-01-02

## API Endpoint Details

### Endpoint
```
GET https://api.tastyworks.com/market-data?symbols={osi_symbol}
Authorization: Bearer {access_token}
```

### OSI Symbol Format
```
{SYMBOL}{YY}{MMDD}{C/P}{STRIKE_8DIGITS}
```

**Components:**
- `SYMBOL`: Ticker symbol, left-justified with trailing spaces to 6 chars (e.g., `"TSLA  "`)
- `YY`: Last 2 digits of expiration year
- `MMDD`: 4-digit month and day
- `C/P`: Option type (C for Call, P for Put)
- `STRIKE_8DIGITS`: Strike × 1000, padded to 8 digits

**Examples:**
- `TSLA  260102C00080000` = TSLA $80 Call expiring 2026-01-02
- `SPY   250516C00048000` = SPY $48 Call expiring 2025-05-16

### Response Data
```json
{
  "data": {
    "items": [{
      "symbol": "TSLA  260102C00080000",
      "instrument-type": "Equity Option",
      "bid": "355.25",
      "ask": "361.65",
      "mark": "358.45",
      "last": "372.08",
      "delta": "1.0",
      "gamma": "0.0",
      "theta": "-0.00000176",
      "vega": "0.0",
      "rho": "0.000001493",
      "volatility": "8.435016723",  // Implied Volatility (decimal, e.g., 8.435 = 843.5%)
      "theo-price": "357.95500176"
    }]
  }
}
```

## Implementation

### Files Modified

#### 1. `tastytrade_client.py`

**`get_option_greeks()` (line 165)**
- Fetches Greeks for a single option
- Converts parameters to OSI symbol format
- Returns dict with all Greeks, IV, and pricing data

**`get_batch_option_greeks()` (line 261)**
- Fetches Greeks for up to 50 options in one API call
- Much more efficient for multi-leg strategies
- Respects 5-minute cache

**`_to_osi_symbol()` (line 385)**
- Converts option parameters to OSI symbol format
- Handles symbol padding, date formatting, strike encoding

#### 2. `calculator.py`

**`calculate_pl()` (line 829)**
- Priority system for IV selection:
  1. Manual IV override (`position.manual_iv`)
  2. Per-strike IV from Tastytrade API
  3. Default ATM IV (fallback)
- Uses batch API call for all positions
- Per-strike IV used in all calculations:
  - Current theoretical P/L
  - P/L at future dates
  - Portfolio Greeks

## Code Examples

### Single Option Greeks Fetch
```python
from tastytrade_client import get_tastytrade_client

client = get_tastytrade_client()
greeks = client.get_option_greeks(
    symbol='TSLA',
    strike=80.0,
    expiration_date='2026-01-02',
    option_type='C'
)

# Returns:
# {
#     'delta': 1.0,
#     'gamma': 0.0,
#     'theta': -0.00000176,
#     'vega': 0.0,
#     'rho': 0.000001493,
#     'implied_volatility': 8.435016723,  # 843.5% IV
#     'bid': 355.25,
#     'ask': 361.65,
#     'mark': 358.45,
#     'theo_price': 357.95
# }
```

### Batch Greeks Fetch
```python
positions = [
    {'symbol': 'TSLA', 'strike': 280, 'expiration_date': '2026-01-16', 'option_type': 'P'},
    {'symbol': 'TSLA', 'strike': 300, 'expiration_date': '2026-01-16', 'option_type': 'P'},
    {'symbol': 'TSLA', 'strike': 320, 'expiration_date': '2026-01-16', 'option_type': 'C'},
    {'symbol': 'TSLA', 'strike': 340, 'expiration_date': '2026-01-16', 'option_type': 'C'},
]

client = get_tastytrade_client()
results = client.get_batch_option_greeks(positions)

# Results dict keyed by: "{symbol}_{strike}_{expiration_date}_{option_type}"
# e.g., "TSLA_280_2026-01-16_P"
```

### P/L Calculation with Per-Strike IV
```python
from calculator import calculate_pl

positions = [
    {'qty': -1, 'strike': 280, 'type': 'P', 'expiration': '1/16/26', 'symbol': 'TSLA'},
    {'qty': 1, 'strike': 300, 'type': 'P', 'expiration': '1/16/26', 'symbol': 'TSLA'},
    {'qty': 1, 'strike': 320, 'type': 'C', 'expiration': '1/16/26', 'symbol': 'TSLA'},
    {'qty': -1, 'strike': 340, 'type': 'C', 'expiration': '1/16/26', 'symbol': 'TSLA'},
]

market_data = {
    'symbol': 'TSLA',
    'current_price': 310.0,
    'implied_volatility': 0.85,  # Fallback ATM IV
    'risk_free_rate': 0.0425,
}

result = calculate_pl(
    positions=positions,
    credit=5.50,
    market_data=market_data,
    use_theoretical_pricing=True
)

# Each position uses its own IV:
# P 280: IV=91.29%
# P 300: IV=82.51%
# C 320: IV=86.83%
# C 340: IV=74.45%
```

## Volatility Smile/Skew

The per-strike IV data reveals the volatility smile/skew pattern:

| Strike | Option Type | IV | Notes |
|--------|-------------|-----|-------|
| 280 | Put | 91.29% | Deep OTM - highest IV |
| 300 | Put | 82.51% | OTM |
| 320 | Call | 86.83% | Slight ITM |
| 340 | Call | 74.45% | OTM - lowest IV |

This pattern is typical for equities and reflects market expectations of downside risk.

## Caching

- Greeks data is cached for 5 minutes
- Cache key: `greeks_{symbol}_{strike}_{expiration_date}_{option_type}`
- Reduces redundant API calls`
- Batch method respects existing cache

## Error Handling

1. **API unavailable:** Falls back to default ATM IV
2. **Invalid symbol:** Logs warning, uses default IV
3. **No data returned:** Logs warning, uses default IV
4. **Manual IV override:** Takes precedence over API

## Future Enhancements

- Consider implementing local IV interpolation between strikes
- Add IV term structure (different IV for different expirations)
- Cache optimization: persist cache to disk for faster startup
