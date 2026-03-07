"""Backtesting engine for option strategies.

Walks through historical intraday snapshots and tracks strategy P&L
using actual CE/PE prices from the dataset.
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Optional
from strategies import generate_strategies, STRATEGY_TEMPLATES


def backtest_strategy(
    df: pd.DataFrame,
    legs: List[Dict],
    entry_datetime: str,
    expiry: str,
    exit_datetime: Optional[str] = None,
) -> Dict:
    """Backtest a multi-leg option strategy on historical data.

    Args:
        df: full options DataFrame with columns:
            datetime, expiry, strike, CE, PE, spot_close, ATM
        legs: list of leg dicts, each with:
            type ("CE"/"PE"), strike (float), action ("buy"/"sell"), qty (int), premium (float)
        entry_datetime: entry timestamp string
        expiry: expiry date string
        exit_datetime: optional exit timestamp (defaults to last available)

    Returns:
        dict with equity_curve, metrics, trade_log
    """
    filtered = df[df["expiry"] == expiry].copy()
    if filtered.empty:
        return {"error": "No data for this expiry"}

    # Get all datetimes from entry onwards
    all_dts = sorted(filtered["datetime"].unique())
    entry_dt = pd.Timestamp(entry_datetime)

    # Find entry index
    entry_idx = None
    for i, dt in enumerate(all_dts):
        if dt >= entry_dt:
            entry_idx = i
            break
    if entry_idx is None:
        return {"error": "Entry datetime not found in data"}

    # Determine exit
    if exit_datetime:
        exit_dt = pd.Timestamp(exit_datetime)
        dts = [dt for dt in all_dts[entry_idx:] if dt <= exit_dt]
    else:
        dts = list(all_dts[entry_idx:])

    if len(dts) < 2:
        return {"error": "Not enough data points for backtest"}

    # Build strike->price lookup per datetime
    strike_prices = {}
    for dt in dts:
        snap = filtered[filtered["datetime"] == dt]
        price_map = {}
        for _, row in snap.iterrows():
            s = float(row["strike"])
            price_map[s] = {
                "CE": float(row["CE"]),
                "PE": float(row["PE"]),
                "spot": float(row["spot_close"]),
            }
        strike_prices[dt] = price_map

    # Validate all leg strikes exist at entry
    entry_prices = strike_prices.get(dts[0], {})
    for leg in legs:
        if leg["strike"] not in entry_prices:
            return {"error": f"Strike {leg['strike']} not found at entry datetime"}

    # Compute entry cost
    entry_cost = 0.0
    for leg in legs:
        sign = -1 if leg["action"] == "buy" else 1
        entry_cost += sign * leg["premium"] * leg["qty"]

    # Walk through each datetime and compute strategy value
    equity_curve = []
    peak_pnl = float("-inf")
    max_drawdown = 0.0
    pnl_values = []

    for dt in dts:
        snap_prices = strike_prices.get(dt, {})
        spot = None
        strategy_value = 0.0
        valid = True

        for leg in legs:
            prices = snap_prices.get(leg["strike"])
            if not prices:
                valid = False
                break
            if spot is None:
                spot = prices["spot"]

            current_price = prices[leg["type"]]
            sign = 1 if leg["action"] == "buy" else -1
            # Value of this leg = sign * (current_price - entry_premium) * qty
            leg_pnl = sign * (current_price - leg["premium"]) * leg["qty"]
            strategy_value += leg_pnl

        if not valid:
            continue

        # Track drawdown
        if strategy_value > peak_pnl:
            peak_pnl = strategy_value
        dd = peak_pnl - strategy_value
        if dd > max_drawdown:
            max_drawdown = dd

        pnl_values.append(strategy_value)
        equity_curve.append({
            "datetime": str(dt),
            "spot": round(spot, 2) if spot else None,
            "pnl": round(strategy_value, 2),
        })

    if len(pnl_values) < 2:
        return {"error": "Insufficient price data for backtest"}

    # Compute metrics
    final_pnl = pnl_values[-1]
    pnl_array = np.array(pnl_values)
    returns = np.diff(pnl_array)

    # Win rate (% of positive return intervals)
    win_rate = float(np.sum(returns > 0) / len(returns) * 100) if len(returns) > 0 else 0

    # Sharpe-like ratio (annualized using ~375 intraday snapshots per day, ~252 trading days)
    if np.std(returns) > 0:
        sharpe = float(np.mean(returns) / np.std(returns) * np.sqrt(252))
    else:
        sharpe = 0.0

    # Profit factor
    gross_profit = float(np.sum(returns[returns > 0]))
    gross_loss = float(abs(np.sum(returns[returns < 0])))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else None

    # Exit leg values
    exit_legs = []
    if dts:
        exit_snap = strike_prices.get(dts[-1], {})
        for leg in legs:
            prices = exit_snap.get(leg["strike"], {})
            exit_price = prices.get(leg["type"], 0) if prices else 0
            sign = 1 if leg["action"] == "buy" else -1
            leg_pnl = sign * (exit_price - leg["premium"]) * leg["qty"]
            exit_legs.append({
                "type": leg["type"],
                "strike": leg["strike"],
                "action": leg["action"],
                "qty": leg["qty"],
                "entry_premium": leg["premium"],
                "exit_price": round(exit_price, 2),
                "leg_pnl": round(leg_pnl, 2),
            })

    return {
        "entry_datetime": str(dts[0]),
        "exit_datetime": str(dts[-1]),
        "num_snapshots": len(equity_curve),
        "entry_cost": round(entry_cost, 2),
        "equity_curve": equity_curve,
        "exit_legs": exit_legs,
        "metrics": {
            "total_pnl": round(final_pnl, 2),
            "max_profit": round(float(np.max(pnl_array)), 2),
            "max_loss": round(float(np.min(pnl_array)), 2),
            "max_drawdown": round(max_drawdown, 2),
            "win_rate": round(win_rate, 2),
            "sharpe": round(sharpe, 2),
            "profit_factor": profit_factor,
        },
    }


def _quick_pnl(df_filtered, legs, entry_dt, exit_dt, all_dts):
    """Lightweight P&L calculation for optimizer (no full equity curve)."""
    entry_idx = None
    for i, dt in enumerate(all_dts):
        if dt >= entry_dt:
            entry_idx = i
            break
    if entry_idx is None:
        return None

    exit_idx = None
    for i, dt in enumerate(all_dts):
        if dt >= exit_dt:
            exit_idx = i
            break
    if exit_idx is None:
        exit_idx = len(all_dts) - 1

    entry_snap = df_filtered[df_filtered["datetime"] == all_dts[entry_idx]]
    exit_snap = df_filtered[df_filtered["datetime"] == all_dts[exit_idx]]

    if entry_snap.empty or exit_snap.empty:
        return None

    entry_map = {float(r["strike"]): r for _, r in entry_snap.iterrows()}
    exit_map = {float(r["strike"]): r for _, r in exit_snap.iterrows()}

    pnl = 0.0
    for leg in legs:
        entry_row = entry_map.get(leg["strike"])
        exit_row = exit_map.get(leg["strike"])
        if entry_row is None or exit_row is None:
            return None

        entry_price = float(entry_row[leg["type"]])
        exit_price = float(exit_row[leg["type"]])
        sign = 1 if leg["action"] == "buy" else -1
        pnl += sign * (exit_price - entry_price) * leg.get("qty", 1)

    return round(pnl, 2)


def optimize_strategy(
    df: pd.DataFrame,
    strategy_id: str,
    expiry: str,
    get_option_chain_fn,
    num_samples: int = 30,
) -> Dict:
    """Find the best entry time and holding period for a strategy.

    Samples entry points across the expiry, tests multiple holding durations,
    and returns the optimal combination.
    """
    filtered = df[df["expiry"] == expiry].copy()
    if filtered.empty:
        return {"error": "No data for this expiry"}

    all_dts = sorted(filtered["datetime"].unique())
    if len(all_dts) < 10:
        return {"error": "Not enough data points"}

    # Sample entry datetimes (skip last 20% so there's room for holding)
    cutoff = int(len(all_dts) * 0.8)
    step = max(1, cutoff // num_samples)
    entry_candidates = [all_dts[i] for i in range(0, cutoff, step)]

    # Holding durations as fraction of remaining time
    hold_fractions = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0]

    results = []

    for entry_dt in entry_candidates:
        entry_idx = list(all_dts).index(entry_dt)
        remaining = len(all_dts) - entry_idx - 1
        if remaining < 5:
            continue

        # Get chain at this entry point to build legs
        chain_data = get_option_chain_fn(expiry=expiry, datetime_str=str(entry_dt))
        if not chain_data.get("chain"):
            continue

        strats = generate_strategies(chain_data["chain"], chain_data["spot"], chain_data["atm"])
        target = next((s for s in strats if s["id"] == strategy_id), None)
        if not target:
            continue

        legs = [
            {"type": l["type"], "strike": l["strike"], "action": l["action"],
             "qty": l["qty"], "premium": l["premium"]}
            for l in target["legs"]
        ]

        for frac in hold_fractions:
            hold_steps = max(2, int(remaining * frac))
            exit_dt = all_dts[min(entry_idx + hold_steps, len(all_dts) - 1)]

            pnl = _quick_pnl(filtered, legs, entry_dt, exit_dt, all_dts)
            if pnl is None:
                continue

            hold_hours = round((exit_dt - entry_dt).total_seconds() / 3600, 1)
            results.append({
                "entry": str(entry_dt),
                "exit": str(exit_dt),
                "hold_hours": hold_hours,
                "hold_fraction": frac,
                "pnl": pnl,
                "net_premium": target["net_premium"],
            })

    if not results:
        return {"error": "Could not compute any scenarios"}

    # Sort by P&L
    results.sort(key=lambda x: x["pnl"], reverse=True)

    best = results[0]
    worst = results[-1]

    # Group by hold_fraction to find best timespan
    from collections import defaultdict
    by_hold = defaultdict(list)
    for r in results:
        by_hold[r["hold_fraction"]].append(r["pnl"])

    timespan_analysis = []
    for frac in sorted(by_hold.keys()):
        pnls = by_hold[frac]
        timespan_analysis.append({
            "hold_fraction": frac,
            "avg_pnl": round(np.mean(pnls), 2),
            "median_pnl": round(float(np.median(pnls)), 2),
            "win_rate": round(sum(1 for p in pnls if p > 0) / len(pnls) * 100, 1),
            "count": len(pnls),
        })

    best_timespan = max(timespan_analysis, key=lambda x: x["avg_pnl"])

    # Entry time analysis (group by hour of day)
    hourly = defaultdict(list)
    for r in results:
        hour = pd.Timestamp(r["entry"]).hour
        hourly[hour].append(r["pnl"])

    entry_time_analysis = []
    for hour in sorted(hourly.keys()):
        pnls = hourly[hour]
        entry_time_analysis.append({
            "hour": hour,
            "avg_pnl": round(np.mean(pnls), 2),
            "win_rate": round(sum(1 for p in pnls if p > 0) / len(pnls) * 100, 1),
            "count": len(pnls),
        })

    best_hour = max(entry_time_analysis, key=lambda x: x["avg_pnl"])

    return {
        "strategy_id": strategy_id,
        "total_scenarios": len(results),
        "best": best,
        "worst": worst,
        "best_timespan": best_timespan,
        "best_entry_hour": best_hour,
        "timespan_analysis": timespan_analysis,
        "entry_time_analysis": entry_time_analysis,
        "top_5": results[:5],
        "bottom_5": results[-5:],
        "all_results": [
            {"entry": r["entry"], "hold_hours": r["hold_hours"], "pnl": r["pnl"]}
            for r in results
        ],
    }
