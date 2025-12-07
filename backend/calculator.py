import numpy as np

def calculate_pl(positions, credit, range_percent=0.5):
    # Determine range for the chart based on strike prices
    strikes = [p['strike'] for p in positions]
    if not strikes:
        raise ValueError("At least one position with a strike price is required")

    min_strike = min(strikes)
    max_strike = max(strikes)
    lower_bound = min_strike * (1 - range_percent)
    upper_bound = max_strike * (1 + range_percent)
        
    # Ensure bounds are integers for arange
    start = int(np.floor(lower_bound))
    end = int(np.ceil(upper_bound))
    
    # Generate prices with step 1 (every dollar)
    prices = np.arange(start, end + 1, 1)
    
    # Calculate exact breakeven points
    breakeven_points = []
    
    # Helper to calculate P/L for a single price
    def get_pl(price):
        total_pl = float(credit)
        for pos in positions:
            qty = pos['qty']
            strike = pos['strike']
            otype = pos['type']
            if otype == 'C':
                value = max(0, price - strike)
            else:
                value = max(0, strike - price)
            total_pl += qty * value * 100
        return total_pl

    # Find roots between critical points (strikes + bounds)
    strikes = sorted(list(set([p['strike'] for p in positions])))
    check_points = sorted(list(set([start, end] + strikes)))
    
    for i in range(len(check_points) - 1):
        p1 = check_points[i]
        p2 = check_points[i+1]
        
        pl1 = get_pl(p1)
        pl2 = get_pl(p2)
        
        if pl1 == 0:
            breakeven_points.append(p1)
        
        if pl1 * pl2 < 0:
            # Linear interpolation
            root = p1 + (0 - pl1) * (p2 - p1) / (pl2 - pl1)
            breakeven_points.append(root)
            
    if get_pl(check_points[-1]) == 0:
        breakeven_points.append(check_points[-1])

    # Merge integer prices and breakeven points
    all_prices = sorted(list(set(prices.tolist() + breakeven_points)))
    
    data_points = []
    
    for price in all_prices:
        total_pl = get_pl(price)
        data_points.append({"price": float(price), "pl": float(round(total_pl, 2))})
        
    return data_points
