# Why Volatility Smile Exists

**Volatility smile** refers to the pattern where implied volatility (IV) is higher for both deep ITM (in-the-money) and deep OTM (out-of-the-money) options compared to ATM (at-the-money) options.

## Primary Causes

### 1. Fat Tails / Crash Risk

Real market returns have "fatter tails" than the log-normal distribution assumed by Black-Scholes.

- Extreme moves happen more often than the model predicts
- OTM puts are priced higher (higher IV) to protect against crashes

### 2. Supply and Demand Imbalance

| Option Type | Demand Driver | IV Impact |
|-------------|---------------|-----------|
| OTM puts | Portfolio protection (insurance) | Higher IV |
| OTM calls | Speculative demand for upside | Higher IV |
| ATM options | More liquid, tighter competition | Lower IV |

### 3. Jump Risk & Skew

- Markets fall faster than they rise (panic vs. gradual optimism)
- This creates **volatility skew** - typically OTM puts have higher IV than OTM calls
- The combination creates the "smile" shape

---

## Trading Advantages

### 1. Relative Value Trades

Compare IV across strikes to find mispriced options:

- If OTM put IV is 60% but ATM is 35%, the OTM put may be expensive
- Consider **selling** expensive premium (high IV options) and **buying** cheap premium

### 2. Vertical Spread Optimization

- **Bull Put Spreads**: Sell OTM puts (high IV), buy further OTM puts (even higher IV) = net credit
- The skew lets you structure spreads with favorable risk-reward

### 3. IV Rank & Mean Reversion

- Track whether current IV at each strike is high/low vs. its own history
- Trade mean reversion: sell when IV is historically high, buy when low

### 4. Event Trading

- Before earnings/events: smile flattens as all IV rises
- After events: smile steepens as OTM IV remains elevated (uncertainty)
- Trade the **change in smile shape**, not just level

### 5. Identifying Mispricing

- If a strike's IV deviates from the smooth smile curve, it may be mispriced
- Arbitrage: sell the overpriced, hedge with strikes at "fair" IV

### 6. Structuring Iron Condors

- Use the smile to place strikes where IV is rich
- Maximize credit received by selling options at elevated IV levels

---

## Applying with Per-Strike IV Data

With access to per-strike IV data from Tastytrade API:

1. **Visualize the skew** - See how IV changes across strikes
2. **Compare strategies** - See how vertical spreads perform differently due to IV differences
3. **Time entry/exit** - Enter positions when the skew is steep (sell expensive OTM protection)
4. **Calculate fair value** - Compare an option's IV to the curve to spot mispricing
