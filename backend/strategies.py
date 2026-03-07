"""Option strategy generation and payoff computation."""

import numpy as np
from greeks import implied_volatility, compute_greeks, bs_call, bs_put, RISK_FREE_RATE


# Strategy leg: each leg is a dict with keys:
#   type: "CE" or "PE"
#   strike: float
#   action: "buy" or "sell"
#   qty: int (lot multiplier, default 1)
#   premium: float (entry price per unit)

STRATEGY_TEMPLATES = {
    "bull_call_spread": {
        "name": "Bull Call Spread",
        "sentiment": "bullish",
        "description": "Buy lower strike CE, sell higher strike CE. Limited risk, limited reward bullish play.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "CE", "strike_offset": 1, "action": "sell"},
        ],
    },
    "bear_put_spread": {
        "name": "Bear Put Spread",
        "sentiment": "bearish",
        "description": "Buy higher strike PE, sell lower strike PE. Limited risk bearish play.",
        "legs": [
            {"type": "PE", "strike_offset": 0, "action": "sell"},
            {"type": "PE", "strike_offset": 1, "action": "buy"},
        ],
    },
    "long_straddle": {
        "name": "Long Straddle",
        "sentiment": "neutral",
        "description": "Buy ATM CE + ATM PE. Profits from large moves in either direction.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "PE", "strike_offset": 0, "action": "buy"},
        ],
    },
    "short_straddle": {
        "name": "Short Straddle",
        "sentiment": "neutral",
        "description": "Sell ATM CE + ATM PE. Profits from low volatility / range-bound market.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "sell"},
            {"type": "PE", "strike_offset": 0, "action": "sell"},
        ],
    },
    "long_strangle": {
        "name": "Long Strangle",
        "sentiment": "neutral",
        "description": "Buy OTM CE + OTM PE. Cheaper than straddle, needs bigger move to profit.",
        "legs": [
            {"type": "CE", "strike_offset": 1, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "buy"},
        ],
    },
    "short_strangle": {
        "name": "Short Strangle",
        "sentiment": "neutral",
        "description": "Sell OTM CE + OTM PE. Collect premium if price stays in range.",
        "legs": [
            {"type": "CE", "strike_offset": 1, "action": "sell"},
            {"type": "PE", "strike_offset": -1, "action": "sell"},
        ],
    },
    "iron_condor": {
        "name": "Iron Condor",
        "sentiment": "neutral",
        "description": "Sell OTM CE + PE spreads. Profits from range-bound market with defined risk.",
        "legs": [
            {"type": "PE", "strike_offset": -2, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "sell"},
            {"type": "CE", "strike_offset": 1, "action": "sell"},
            {"type": "CE", "strike_offset": 2, "action": "buy"},
        ],
    },
    "long_butterfly": {
        "name": "Long Butterfly",
        "sentiment": "neutral",
        "description": "Buy 1 lower CE, sell 2 ATM CE, buy 1 higher CE. Profits if price stays near ATM.",
        "legs": [
            {"type": "CE", "strike_offset": -1, "action": "buy"},
            {"type": "CE", "strike_offset": 0, "action": "sell", "qty": 2},
            {"type": "CE", "strike_offset": 1, "action": "buy"},
        ],
    },
    "put_butterfly": {
        "name": "Put Butterfly",
        "sentiment": "neutral",
        "description": "Buy 1 lower PE, sell 2 ATM PE, buy 1 higher PE. Profits if price stays near ATM. Put-based variant.",
        "legs": [
            {"type": "PE", "strike_offset": -1, "action": "buy"},
            {"type": "PE", "strike_offset": 0, "action": "sell", "qty": 2},
            {"type": "PE", "strike_offset": 1, "action": "buy"},
        ],
    },
    "bull_put_spread": {
        "name": "Bull Put Spread",
        "sentiment": "bullish",
        "description": "Sell higher strike PE, buy lower strike PE. Credit spread that profits if price stays above the sold strike.",
        "legs": [
            {"type": "PE", "strike_offset": 0, "action": "sell"},
            {"type": "PE", "strike_offset": -1, "action": "buy"},
        ],
    },
    "bear_call_spread": {
        "name": "Bear Call Spread",
        "sentiment": "bearish",
        "description": "Sell lower strike CE, buy higher strike CE. Credit spread that profits if price stays below the sold strike.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "sell"},
            {"type": "CE", "strike_offset": 1, "action": "buy"},
        ],
    },
    "long_call": {
        "name": "Long Call",
        "sentiment": "bullish",
        "description": "Buy ATM CE. Simple directional bullish bet with unlimited upside and limited downside.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
        ],
    },
    "long_put": {
        "name": "Long Put",
        "sentiment": "bearish",
        "description": "Buy ATM PE. Simple directional bearish bet. Profits from downside moves.",
        "legs": [
            {"type": "PE", "strike_offset": 0, "action": "buy"},
        ],
    },
    "covered_call": {
        "name": "Synthetic Covered Call",
        "sentiment": "bullish",
        "description": "Buy ATM CE + Sell OTM CE. Reduces cost basis vs naked call but caps upside.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "CE", "strike_offset": 2, "action": "sell"},
        ],
    },
    "protective_put": {
        "name": "Protective Put",
        "sentiment": "bullish",
        "description": "Buy ATM CE + Buy OTM PE. Bullish with downside protection. Like insurance on a long position.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "buy"},
        ],
    },
    "iron_butterfly": {
        "name": "Iron Butterfly",
        "sentiment": "neutral",
        "description": "Sell ATM CE + PE, buy OTM CE + PE. Tighter than iron condor, higher credit, needs price to stay near ATM.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "sell"},
            {"type": "PE", "strike_offset": 0, "action": "sell"},
            {"type": "CE", "strike_offset": 2, "action": "buy"},
            {"type": "PE", "strike_offset": -2, "action": "buy"},
        ],
    },
    "ratio_call_spread": {
        "name": "Ratio Call Spread",
        "sentiment": "bullish",
        "description": "Buy 1 ATM CE, sell 2 OTM CE. Reduces cost or creates credit. Risk if price rallies sharply above sold strikes.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "CE", "strike_offset": 1, "action": "sell", "qty": 2},
        ],
    },
    "ratio_put_spread": {
        "name": "Ratio Put Spread",
        "sentiment": "bearish",
        "description": "Buy 1 ATM PE, sell 2 OTM PE. Reduces cost on bearish bet. Risk if price drops sharply below sold strikes.",
        "legs": [
            {"type": "PE", "strike_offset": 0, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "sell", "qty": 2},
        ],
    },
    "jade_lizard": {
        "name": "Jade Lizard",
        "sentiment": "bullish",
        "description": "Sell OTM PE + sell OTM CE spread (sell CE, buy further OTM CE). No upside risk if credit > CE spread width.",
        "legs": [
            {"type": "PE", "strike_offset": -1, "action": "sell"},
            {"type": "CE", "strike_offset": 1, "action": "sell"},
            {"type": "CE", "strike_offset": 2, "action": "buy"},
        ],
    },
    "call_ladder": {
        "name": "Call Ladder",
        "sentiment": "bullish",
        "description": "Buy 1 ATM CE, sell 1 OTM CE, sell 1 further OTM CE. Profits in moderate bullish move, risk on big rally.",
        "legs": [
            {"type": "CE", "strike_offset": 0, "action": "buy"},
            {"type": "CE", "strike_offset": 1, "action": "sell"},
            {"type": "CE", "strike_offset": 2, "action": "sell"},
        ],
    },
    "put_ladder": {
        "name": "Put Ladder",
        "sentiment": "bearish",
        "description": "Buy 1 ATM PE, sell 1 OTM PE, sell 1 further OTM PE. Profits in moderate bearish move, risk on big crash.",
        "legs": [
            {"type": "PE", "strike_offset": 0, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "sell"},
            {"type": "PE", "strike_offset": -2, "action": "sell"},
        ],
    },
    "wide_iron_condor": {
        "name": "Wide Iron Condor",
        "sentiment": "neutral",
        "description": "Like iron condor but with wider wings (3 strikes apart). More room for price movement, lower credit.",
        "legs": [
            {"type": "PE", "strike_offset": -3, "action": "buy"},
            {"type": "PE", "strike_offset": -1, "action": "sell"},
            {"type": "CE", "strike_offset": 1, "action": "sell"},
            {"type": "CE", "strike_offset": 3, "action": "buy"},
        ],
    },
}


def _resolve_strike(strikes, atm_idx, offset):
    """Resolve a strike from ATM index + offset, clamped to valid range."""
    idx = atm_idx + offset
    idx = max(0, min(idx, len(strikes) - 1))
    return strikes[idx]


def generate_strategies(chain_data, spot, atm):
    """Generate all strategy templates from an option chain snapshot.

    Args:
        chain_data: list of dicts from /api/option-chain (each has strike, ce_price, pe_price, greeks...)
        spot: current spot price
        atm: ATM strike

    Returns:
        list of strategy dicts with legs, payoff profile, greeks, risk/reward
    """
    if not chain_data:
        return []

    # Build strike lookup
    strike_map = {row["strike"]: row for row in chain_data}
    strikes = sorted(strike_map.keys())
    if not strikes:
        return []

    # Find ATM index
    atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - atm))

    results = []
    for key, template in STRATEGY_TEMPLATES.items():
        legs = []
        valid = True

        for leg_tmpl in template["legs"]:
            strike = _resolve_strike(strikes, atm_idx, leg_tmpl["strike_offset"])
            row = strike_map.get(strike)
            if not row:
                valid = False
                break

            price_key = "ce_price" if leg_tmpl["type"] == "CE" else "pe_price"
            premium = row.get(price_key, 0)
            if premium is None or premium <= 0:
                valid = False
                break

            qty = leg_tmpl.get("qty", 1)
            legs.append({
                "type": leg_tmpl["type"],
                "strike": strike,
                "action": leg_tmpl["action"],
                "qty": qty,
                "premium": round(premium, 2),
                "iv": row.get(f"{'ce' if leg_tmpl['type'] == 'CE' else 'pe'}_iv"),
                "delta": row.get(f"{'ce' if leg_tmpl['type'] == 'CE' else 'pe'}_delta"),
                "theta": row.get(f"{'ce' if leg_tmpl['type'] == 'CE' else 'pe'}_theta"),
                "vega": row.get(f"{'ce' if leg_tmpl['type'] == 'CE' else 'pe'}_vega"),
                "gamma": row.get(f"{'ce' if leg_tmpl['type'] == 'CE' else 'pe'}_gamma"),
            })

        if not valid or not legs:
            continue

        # Compute net premium (cost)
        net_premium = 0.0
        for leg in legs:
            sign = -1 if leg["action"] == "buy" else 1
            net_premium += sign * leg["premium"] * leg["qty"]
        # net_premium > 0 means net credit, < 0 means net debit

        # Compute payoff at expiry across a range of spot prices
        all_strikes = [l["strike"] for l in legs]
        min_s = min(all_strikes) - 500
        max_s = max(all_strikes) + 500
        spot_range = np.linspace(min_s, max_s, 100)
        payoffs = compute_strategy_payoff(legs, spot_range)

        max_profit = float(np.max(payoffs))
        max_loss = float(np.min(payoffs))

        # Find breakevens (where payoff crosses zero)
        breakevens = []
        for i in range(len(payoffs) - 1):
            if payoffs[i] * payoffs[i + 1] < 0:
                # Linear interpolation
                x = spot_range[i] - payoffs[i] * (spot_range[i + 1] - spot_range[i]) / (payoffs[i + 1] - payoffs[i])
                breakevens.append(round(float(x), 2))

        # Net greeks
        net_delta = 0.0
        net_gamma = 0.0
        net_theta = 0.0
        net_vega = 0.0
        for leg in legs:
            sign = 1 if leg["action"] == "buy" else -1
            q = leg["qty"]
            if leg["delta"] is not None:
                net_delta += sign * q * leg["delta"]
            if leg["gamma"] is not None:
                net_gamma += sign * q * leg["gamma"]
            if leg["theta"] is not None:
                net_theta += sign * q * leg["theta"]
            if leg["vega"] is not None:
                net_vega += sign * q * leg["vega"]

        results.append({
            "id": key,
            "name": template["name"],
            "sentiment": template["sentiment"],
            "description": template["description"],
            "legs": legs,
            "net_premium": round(net_premium, 2),
            "max_profit": round(max_profit, 2),
            "max_loss": round(max_loss, 2),
            "breakevens": breakevens,
            "risk_reward": round(abs(max_profit / max_loss), 2) if max_loss != 0 else None,
            "net_greeks": {
                "delta": round(net_delta, 6),
                "gamma": round(net_gamma, 6),
                "theta": round(net_theta, 4),
                "vega": round(net_vega, 4),
            },
            "payoff": {
                "spot_range": [round(float(s), 2) for s in spot_range],
                "pnl": [round(float(p), 2) for p in payoffs],
            },
        })

    return results


def compute_strategy_payoff(legs, spot_range):
    """Compute P&L at expiry for a strategy across spot prices.

    Args:
        legs: list of leg dicts (type, strike, action, qty, premium)
        spot_range: numpy array of spot prices

    Returns:
        numpy array of P&L values
    """
    payoffs = np.zeros(len(spot_range))
    for leg in legs:
        K = leg["strike"]
        premium = leg["premium"]
        qty = leg["qty"]
        sign = 1 if leg["action"] == "buy" else -1

        if leg["type"] == "CE":
            intrinsic = np.maximum(spot_range - K, 0)
        else:
            intrinsic = np.maximum(K - spot_range, 0)

        leg_pnl = sign * (intrinsic - premium) * qty
        payoffs += leg_pnl

    return payoffs


def compute_custom_payoff(legs_input, spot, spot_range_width=500, num_points=100):
    """Compute payoff for user-defined legs.

    Args:
        legs_input: list of dicts with type, strike, action, qty, premium
        spot: current spot for centering the range
        spot_range_width: half-width of spot range
        num_points: number of points

    Returns:
        dict with spot_range, pnl, max_profit, max_loss, breakevens
    """
    all_strikes = [l["strike"] for l in legs_input]
    center = spot if spot else np.mean(all_strikes)
    min_s = center - spot_range_width
    max_s = center + spot_range_width
    spot_range = np.linspace(min_s, max_s, num_points)

    payoffs = compute_strategy_payoff(legs_input, spot_range)

    breakevens = []
    for i in range(len(payoffs) - 1):
        if payoffs[i] * payoffs[i + 1] < 0:
            x = spot_range[i] - payoffs[i] * (spot_range[i + 1] - spot_range[i]) / (payoffs[i + 1] - payoffs[i])
            breakevens.append(round(float(x), 2))

    return {
        "spot_range": [round(float(s), 2) for s in spot_range],
        "pnl": [round(float(p), 2) for p in payoffs],
        "max_profit": round(float(np.max(payoffs)), 2),
        "max_loss": round(float(np.min(payoffs)), 2),
        "breakevens": breakevens,
    }
