import numpy as np

def calculate_pl(positions, credit, current_price=180, range_percent=0.5):
    # Determine range for the chart
    # If we have strikes, center around them. If not, use current_price.
    strikes = [p['strike'] for p in positions]
    if strikes:
        min_strike = min(strikes)
        max_strike = max(strikes)
        center = (min_strike + max_strike) / 2
        lower_bound = min_strike * (1 - range_percent)
        upper_bound = max_strike * (1 + range_percent)
    else:
        center = current_price
        lower_bound = center * (1 - range_percent)
        upper_bound = center * (1 + range_percent)
        
    prices = np.linspace(lower_bound, upper_bound, 100)
    data_points = []
    
    for price in prices:
        total_pl = float(credit) # Start with credit collected
        
        for pos in positions:
            qty = pos['qty']
            strike = pos['strike']
            otype = pos['type']
            
            # Value of the option at expiration
            if otype == 'C':
                value = max(0, price - strike)
            else: # Put
                value = max(0, strike - price)
            
            # If we sold the option (qty < 0), we pay the value to close (or it expires)
            # If we bought the option (qty > 0), we receive the value
            # P/L contribution = Qty * Value (at expiration)
            # Wait, standard P/L logic:
            # Short Call: Credit - Max(0, S - K)
            # Long Call: Max(0, S - K) - Debit
            # Here we treat 'credit' as a lump sum passed in.
            # So we just subtract the payout at expiration for short positions, add for long.
            
            # Actually, the user provides "Total Credit Collected".
            # So the P/L at expiration = Total Credit + Sum(Position Value at Expiration)
            # Where Position Value = Qty * OptionIntrinsicValue
            # Example: Short Put (-1). Expiration Price < Strike. Intrinsic = Strike - Price.
            # We have to pay that. So (-1) * (Strike - Price) = -(Strike - Price). Correct.
            
            total_pl += qty * value * 100 # Options are usually 100 shares
            
        data_points.append({"price": round(price, 2), "pl": round(total_pl, 2)})
        
    return data_points
