from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
import json
from ml_models import AnomalyDetector, DirectionPredictor

app = FastAPI(title="CodeForge Options Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"


def load_data() -> pd.DataFrame:
    """Load and concatenate all CSV files."""
    frames = []
    for csv_file in sorted(DATA_DIR.glob("*.csv")):
        df = pd.read_csv(csv_file)
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined["datetime"] = pd.to_datetime(combined["datetime"])
    combined["expiry"] = pd.to_datetime(combined["expiry"])
    return combined


# Load data once at startup
df = load_data()

# Train ML models once on all available data
anomaly_detector = AnomalyDetector()
anomaly_detector.fit(df)

direction_predictor = DirectionPredictor()
direction_predictor.fit(df)


@app.get("/api/overview")
def get_overview():
    """General dataset overview stats."""
    return {
        "total_rows": len(df),
        "date_range": {
            "start": str(df["datetime"].min()),
            "end": str(df["datetime"].max()),
        },
        "expiries": sorted(df["expiry"].dt.strftime("%Y-%m-%d").unique().tolist()),
        "strike_range": {"min": float(df["strike"].min()), "max": float(df["strike"].max())},
        "symbols": df["symbol"].unique().tolist(),
    }


@app.get("/api/oi-by-strike")
def get_oi_by_strike(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
):
    """Open interest by strike price for a given expiry/datetime."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if datetime_str:
        filtered = filtered[filtered["datetime"] == datetime_str]
    else:
        # Use latest datetime available
        filtered = filtered[filtered["datetime"] == filtered["datetime"].max()]

    grouped = (
        filtered.groupby("strike")
        .agg({"oi_CE": "sum", "oi_PE": "sum"})
        .reset_index()
        .sort_values("strike")
    )
    return {
        "strikes": grouped["strike"].tolist(),
        "oi_CE": grouped["oi_CE"].tolist(),
        "oi_PE": grouped["oi_PE"].tolist(),
    }


@app.get("/api/volume-by-strike")
def get_volume_by_strike(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
):
    """Volume by strike price."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if datetime_str:
        filtered = filtered[filtered["datetime"] == datetime_str]
    else:
        filtered = filtered[filtered["datetime"] == filtered["datetime"].max()]

    grouped = (
        filtered.groupby("strike")
        .agg({"volume_CE": "sum", "volume_PE": "sum"})
        .reset_index()
        .sort_values("strike")
    )
    return {
        "strikes": grouped["strike"].tolist(),
        "volume_CE": grouped["volume_CE"].tolist(),
        "volume_PE": grouped["volume_PE"].tolist(),
    }


@app.get("/api/pcr-timeseries")
def get_pcr_timeseries(expiry: Optional[str] = None):
    """Put-Call Ratio over time."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    grouped = (
        filtered.groupby("datetime")
        .agg({"oi_CE": "sum", "oi_PE": "sum", "volume_CE": "sum", "volume_PE": "sum"})
        .reset_index()
        .sort_values("datetime")
    )
    grouped["pcr_oi"] = grouped["oi_PE"] / grouped["oi_CE"].replace(0, np.nan)
    grouped["pcr_volume"] = grouped["volume_PE"] / grouped["volume_CE"].replace(0, np.nan)

    return {
        "datetime": grouped["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "pcr_oi": grouped["pcr_oi"].fillna(0).round(4).tolist(),
        "pcr_volume": grouped["pcr_volume"].fillna(0).round(4).tolist(),
    }


@app.get("/api/spot-timeseries")
def get_spot_timeseries(expiry: Optional[str] = None):
    """Spot price over time."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    grouped = (
        filtered.groupby("datetime")
        .agg({"spot_close": "mean", "ATM": "first"})
        .reset_index()
        .sort_values("datetime")
    )

    return {
        "datetime": grouped["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "spot_close": grouped["spot_close"].round(2).tolist(),
        "atm": grouped["ATM"].tolist(),
    }


@app.get("/api/oi-change")
def get_oi_change(expiry: Optional[str] = None):
    """OI change over time aggregated."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    grouped = (
        filtered.groupby("datetime")
        .agg({"oi_CE": "sum", "oi_PE": "sum"})
        .reset_index()
        .sort_values("datetime")
    )
    grouped["oi_CE_change"] = grouped["oi_CE"].diff().fillna(0)
    grouped["oi_PE_change"] = grouped["oi_PE"].diff().fillna(0)

    return {
        "datetime": grouped["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "oi_CE_change": grouped["oi_CE_change"].tolist(),
        "oi_PE_change": grouped["oi_PE_change"].tolist(),
    }


@app.get("/api/max-pain")
def get_max_pain(expiry: Optional[str] = None):
    """Calculate max pain strike for each datetime."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    results = []
    for dt, group in filtered.groupby("datetime"):
        strikes = group["strike"].unique()
        min_pain = float("inf")
        max_pain_strike = 0
        for s in strikes:
            ce_pain = group.loc[group["strike"] < s, "oi_CE"].sum() * (s - group.loc[group["strike"] < s, "strike"]).sum()
            pe_pain = group.loc[group["strike"] > s, "oi_PE"].sum() * (group.loc[group["strike"] > s, "strike"] - s).sum()
            total = ce_pain + pe_pain
            if total < min_pain:
                min_pain = total
                max_pain_strike = s
        results.append({
            "datetime": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "max_pain": float(max_pain_strike),
            "spot": float(group["spot_close"].iloc[0]),
        })

    # Subsample if too many points
    if len(results) > 500:
        step = len(results) // 500
        results = results[::step]

    return results


@app.get("/api/straddle-price")
def get_straddle_price(expiry: Optional[str] = None):
    """ATM straddle price over time."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    atm_rows = filtered[filtered["strike"] == filtered["ATM"]]
    grouped = (
        atm_rows.groupby("datetime")
        .agg({"CE": "mean", "PE": "mean", "spot_close": "mean"})
        .reset_index()
        .sort_values("datetime")
    )
    grouped["straddle"] = grouped["CE"] + grouped["PE"]

    return {
        "datetime": grouped["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "straddle": grouped["straddle"].round(2).tolist(),
        "spot_close": grouped["spot_close"].round(2).tolist(),
    }


@app.get("/api/datetimes")
def get_datetimes(expiry: Optional[str] = None):
    """Get available datetimes for a given expiry."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    dts = sorted(filtered["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S").unique().tolist())
    return dts


@app.get("/api/candles")
def get_candles(expiry: Optional[str] = None, interval: str = "1D"):
    """Generate OHLC candles from spot_close data.
    interval: '1D' for daily, '1H' for hourly, '30T' for 30-min, '15T' for 15-min.
    """
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    spot = (
        filtered.groupby("datetime")
        .agg({"spot_close": "mean"})
        .reset_index()
        .sort_values("datetime")
        .set_index("datetime")
    )

    # pandas 3.x uses lowercase aliases: 1h, 1d, 15min, 30min
    freq_map = {"1H": "1h", "1D": "1d", "15T": "15min", "30T": "30min"}
    freq = freq_map.get(interval, interval.lower())

    ohlc = spot["spot_close"].resample(freq).agg(
        open="first", high="max", low="min", close="last"
    ).dropna()

    return {
        "datetime": ohlc.index.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "open": ohlc["open"].round(2).tolist(),
        "high": ohlc["high"].round(2).tolist(),
        "low": ohlc["low"].round(2).tolist(),
        "close": ohlc["close"].round(2).tolist(),
    }


def _detect_patterns(opens, highs, lows, closes, datetimes):
    """Detect single and multi-candle patterns from OHLC arrays."""
    patterns = []
    n = len(opens)

    for i in range(n):
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        body = abs(c - o)
        candle_range = h - l
        if candle_range == 0:
            continue
        body_pct = body / candle_range
        upper_shadow = h - max(o, c)
        lower_shadow = min(o, c) - l

        # --- Marubozu ---
        if body_pct >= 0.90:
            if c > o:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Bullish Marubozu",
                    "type": "single",
                    "signal": "bullish",
                    "description": "Strong bullish candle with no/minimal shadows. Open equals Low, Close equals High.",
                    "inference": "Extreme buying pressure — bulls dominated the entire session. Expect bullish continuation over the next few sessions. CE (Call) premiums likely to increase; PE (Put) premiums likely to decay. Consider buying Calls or selling Puts.",
                    "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                    "confidence": round(body_pct * 100, 1),
                })
            else:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Bearish Marubozu",
                    "type": "single",
                    "signal": "bearish",
                    "description": "Strong bearish candle with no/minimal shadows. Open equals High, Close equals Low.",
                    "inference": "Intense selling pressure — bears controlled the session. Expect bearish continuation. PE (Put) premiums likely to increase; CE (Call) premiums likely to decay. Consider buying Puts or selling Calls.",
                    "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                    "confidence": round(body_pct * 100, 1),
                })

        # --- Doji ---
        elif body_pct <= 0.05 and candle_range > 0:
            patterns.append({
                "datetime": datetimes[i],
                "pattern": "Doji",
                "type": "single",
                "signal": "neutral",
                "description": "Open and Close are virtually equal. Indicates market indecision.",
                "inference": "Neither bulls nor bears could establish control — 'calm before the storm.' Direction is uncertain but a big move is likely. Option premiums may increase due to expected volatility. Straddle/Strangle strategies may benefit. Wait for confirmation before taking directional bets.",
                "option_impact": {"CE": "volatility_increase", "PE": "volatility_increase"},
                "confidence": round((1 - body_pct) * 100, 1),
            })

        # --- Spinning Top ---
        elif body_pct <= 0.25 and upper_shadow > body and lower_shadow > body:
            patterns.append({
                "datetime": datetimes[i],
                "pattern": "Spinning Top",
                "type": "single",
                "signal": "neutral",
                "description": "Small real body with upper and lower shadows of roughly equal length.",
                "inference": "Market indecision — both bulls and bears attempted to take control but failed. Like a Doji, suggests a potential reversal or consolidation. Use half-position sizing. Option sellers may benefit from time decay during consolidation.",
                "option_impact": {"CE": "neutral", "PE": "neutral"},
                "confidence": round((1 - body_pct) * 80, 1),
            })

        # --- Hammer (bullish reversal at bottom) ---
        if lower_shadow >= 2 * body and upper_shadow <= body * 0.5 and body_pct > 0.05:
            # Check for prior downtrend (at least 3 candles declining)
            if i >= 3 and closes[i - 1] < closes[i - 3]:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Hammer",
                    "type": "single",
                    "signal": "bullish",
                    "description": "Small body at upper end with long lower shadow (2x body). Appears after a downtrend.",
                    "inference": "Bulls successfully defended lower prices after bears pushed the price down. Bullish reversal signal. CE premiums likely to recover; PE premiums may start decaying. Good opportunity to buy Calls with stop-loss at the hammer's low.",
                    "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                    "confidence": round(min(lower_shadow / body, 4) * 25, 1),
                })

        # --- Hanging Man (bearish reversal at top) ---
        if lower_shadow >= 2 * body and upper_shadow <= body * 0.5 and body_pct > 0.05:
            if i >= 3 and closes[i - 1] > closes[i - 3]:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Hanging Man",
                    "type": "single",
                    "signal": "bearish",
                    "description": "Same shape as Hammer but appears after an uptrend. Bears starting to enter the market.",
                    "inference": "Bears attempted to break bullish control — selling pressure emerging. Bearish reversal signal. PE premiums may increase; CE premiums face risk of decay. Consider buying Puts with stop-loss at the pattern's high.",
                    "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                    "confidence": round(min(lower_shadow / body, 4) * 25, 1),
                })

        # --- Shooting Star (bearish reversal) ---
        if upper_shadow >= 2 * body and lower_shadow <= body * 0.5 and body_pct > 0.05:
            if i >= 3 and closes[i - 1] > closes[i - 3]:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Shooting Star",
                    "type": "single",
                    "signal": "bearish",
                    "description": "Small body at lower end with long upper shadow. Appears after an uptrend.",
                    "inference": "Bulls pushed prices higher but bears rejected the advance. Strong bearish reversal signal. PE premiums likely to increase; CE premiums will decay. Consider buying Puts.",
                    "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                    "confidence": round(min(upper_shadow / body, 4) * 25, 1),
                })

        # --- MULTI-CANDLE PATTERNS (require i >= 1) ---
        if i >= 1:
            prev_o, prev_h, prev_l, prev_c = opens[i - 1], highs[i - 1], lows[i - 1], closes[i - 1]
            prev_body = abs(prev_c - prev_o)

            # --- Bullish Engulfing ---
            if prev_c < prev_o and c > o and o <= prev_c and c >= prev_o:
                if i >= 3 and closes[i - 1] < closes[i - 3]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Bullish Engulfing",
                        "type": "multi",
                        "signal": "bullish",
                        "description": "Blue candle completely engulfs previous red candle's body. Appears after a downtrend.",
                        "inference": "Dramatic shift from selling to buying pressure. Strong bullish reversal — buyers overwhelmed sellers. CE premiums expected to surge; PE premiums will decline sharply. Aggressive Call buying opportunity with stop-loss at the pattern's lowest low.",
                        "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                        "confidence": round(min(body / prev_body, 3) * 33, 1),
                    })

            # --- Bearish Engulfing ---
            if prev_c > prev_o and c < o and o >= prev_c and c <= prev_o:
                if i >= 3 and closes[i - 1] > closes[i - 3]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Bearish Engulfing",
                        "type": "multi",
                        "signal": "bearish",
                        "description": "Red candle completely engulfs previous blue candle's body. Appears after an uptrend.",
                        "inference": "Sellers overwhelmed buyers — panic selling likely. Strong bearish reversal. PE premiums will surge; CE premiums will decay rapidly. Aggressive Put buying opportunity with stop-loss at the pattern's highest high.",
                        "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                        "confidence": round(min(body / prev_body, 3) * 33, 1),
                    })

            # --- Bullish Harami ---
            if prev_c < prev_o and c > o and o > prev_c and c < prev_o and body < prev_body:
                if i >= 3 and closes[i - 1] < closes[i - 3]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Bullish Harami",
                        "type": "multi",
                        "signal": "bullish",
                        "description": "Small blue candle contained within previous large red candle's body.",
                        "inference": "Selling pressure is weakening — bears are losing conviction. Moderate bullish reversal signal. CE premiums may gradually recover; PE premiums face headwinds. Consider partial Call positions; wait for confirmation before going full size.",
                        "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                        "confidence": round((1 - body / prev_body) * 80, 1),
                    })

            # --- Bearish Harami ---
            if prev_c > prev_o and c < o and o < prev_c and c > prev_o and body < prev_body:
                if i >= 3 and closes[i - 1] > closes[i - 3]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Bearish Harami",
                        "type": "multi",
                        "signal": "bearish",
                        "description": "Small red candle contained within previous large blue candle's body.",
                        "inference": "Buying pressure is weakening — bulls losing steam. Moderate bearish reversal signal. PE premiums may start rising; CE premiums face risk. Consider partial Put positions with stop-loss at pattern's highest high.",
                        "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                        "confidence": round((1 - body / prev_body) * 80, 1),
                    })

            # --- Piercing Pattern (bullish) ---
            if prev_c < prev_o and c > o and o < prev_l and c > (prev_o + prev_c) / 2 and c < prev_o:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Piercing Pattern",
                    "type": "multi",
                    "signal": "bullish",
                    "description": "Opens below previous low, closes above midpoint of previous red candle.",
                    "inference": "Strong buying emerged after a gap-down opening. Bullish reversal signal. CE premiums expected to increase; PE premiums to decline. Good for Call buying with stop at the pattern's low.",
                    "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                    "confidence": 70.0,
                })

            # --- Dark Cloud Cover (bearish) ---
            if prev_c > prev_o and c < o and o > prev_h and c < (prev_o + prev_c) / 2 and c > prev_o:
                patterns.append({
                    "datetime": datetimes[i],
                    "pattern": "Dark Cloud Cover",
                    "type": "multi",
                    "signal": "bearish",
                    "description": "Opens above previous high, closes below midpoint of previous blue candle.",
                    "inference": "Aggressive selling after a gap-up opening — bearish reversal. PE premiums will increase; CE premiums face sharp decay. Consider Put buying with stop at pattern's high.",
                    "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                    "confidence": 70.0,
                })

        # --- THREE-CANDLE PATTERNS (require i >= 2) ---
        if i >= 2:
            p1_o, p1_h, p1_l, p1_c = opens[i - 2], highs[i - 2], lows[i - 2], closes[i - 2]
            p2_o, p2_h, p2_l, p2_c = opens[i - 1], highs[i - 1], lows[i - 1], closes[i - 1]
            p2_body = abs(p2_c - p2_o)
            p2_range = p2_h - p2_l
            p2_body_pct = p2_body / p2_range if p2_range > 0 else 0

            # --- Morning Star (bullish) ---
            if (p1_c < p1_o  # P1 is red
                and p2_body_pct <= 0.3  # P2 is doji/spinning top
                and c > o  # P3 is blue
                and c > (p1_o + p1_c) / 2):  # P3 closes above P1 midpoint
                if i >= 4 and closes[i - 3] > closes[i - 2]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Morning Star",
                        "type": "multi",
                        "signal": "bullish",
                        "description": "Three-candle bullish reversal: red candle, doji/spinning top, then strong blue candle closing above P1's midpoint.",
                        "inference": "Classic bullish reversal after downtrend. Selling exhaustion (P1) leads to indecision (P2) then buying conviction (P3). Strong signal for CE premium increase and PE premium decay. High-confidence Call buying opportunity.",
                        "option_impact": {"CE": "premium_increase", "PE": "premium_decrease"},
                        "confidence": 85.0,
                    })

            # --- Evening Star (bearish) ---
            if (p1_c > p1_o  # P1 is blue
                and p2_body_pct <= 0.3  # P2 is doji/spinning top
                and c < o  # P3 is red
                and c < (p1_o + p1_c) / 2):  # P3 closes below P1 midpoint
                if i >= 4 and closes[i - 3] < closes[i - 2]:
                    patterns.append({
                        "datetime": datetimes[i],
                        "pattern": "Evening Star",
                        "type": "multi",
                        "signal": "bearish",
                        "description": "Three-candle bearish reversal: blue candle, doji/spinning top, then strong red candle closing below P1's midpoint.",
                        "inference": "Classic bearish reversal after uptrend. Buying exhaustion (P1) leads to indecision (P2) then selling conviction (P3). Strong signal for PE premium increase and CE premium decay. High-confidence Put buying opportunity.",
                        "option_impact": {"CE": "premium_decrease", "PE": "premium_increase"},
                        "confidence": 85.0,
                    })

    return patterns


@app.get("/api/candle-patterns")
def get_candle_patterns(expiry: Optional[str] = None, interval: str = "1D"):
    """Detect candlestick patterns from spot price data."""
    candles = get_candles(expiry=expiry, interval=interval)
    patterns = _detect_patterns(
        candles["open"], candles["high"], candles["low"], candles["close"], candles["datetime"]
    )
    return {
        "candles": candles,
        "patterns": patterns,
        "summary": {
            "total_patterns": len(patterns),
            "bullish": len([p for p in patterns if p["signal"] == "bullish"]),
            "bearish": len([p for p in patterns if p["signal"] == "bearish"]),
            "neutral": len([p for p in patterns if p["signal"] == "neutral"]),
        },
    }


@app.get("/api/query")
def query_data(
    expiry: Optional[str] = None,
    strike_min: Optional[float] = None,
    strike_max: Optional[float] = None,
    datetime_start: Optional[str] = None,
    datetime_end: Optional[str] = None,
    group_by: Optional[str] = None,
    agg: Optional[str] = "sum",
    columns: Optional[str] = None,
    limit: int = 1000,
):
    """Flexible query endpoint for AI-driven chart generation."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if strike_min is not None:
        filtered = filtered[filtered["strike"] >= strike_min]
    if strike_max is not None:
        filtered = filtered[filtered["strike"] <= strike_max]
    if datetime_start:
        filtered = filtered[filtered["datetime"] >= datetime_start]
    if datetime_end:
        filtered = filtered[filtered["datetime"] <= datetime_end]

    if group_by:
        group_cols = [c.strip() for c in group_by.split(",")]
        numeric_cols = filtered.select_dtypes(include=[np.number]).columns.tolist()
        if agg == "mean":
            grouped = filtered.groupby(group_cols)[numeric_cols].mean()
        else:
            grouped = filtered.groupby(group_cols)[numeric_cols].sum()
        result = grouped.reset_index()
    else:
        result = filtered

    if columns:
        cols = [c.strip() for c in columns.split(",")]
        available = [c for c in cols if c in result.columns]
        result = result[available]

    result = result.head(limit)

    # Convert datetime columns to strings
    for col in result.columns:
        if pd.api.types.is_datetime64_any_dtype(result[col]):
            result[col] = result[col].dt.strftime("%Y-%m-%d %H:%M:%S")

    return result.to_dict(orient="list")


@app.get("/api/anomalies")
def get_anomalies(expiry: Optional[str] = None):
    """Detect anomalous market activity using Isolation Forest.
    Model is trained on all data but works on any expiry (uses relative features).
    """
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    results = anomaly_detector.predict(filtered)
    anomalies = [r for r in results if r["is_anomaly"]]
    return {
        "total_snapshots": len(results),
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
        "all": results,
    }


@app.get("/api/direction")
def get_direction(expiry: Optional[str] = None):
    """Predict spot direction from options flow using Random Forest.
    Model is trained on all data but generalizes to new expiries (relative features).
    """
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    results = direction_predictor.predict(filtered)

    # Summary
    bullish = sum(1 for r in results if r["signal"] == "bullish")
    bearish = sum(1 for r in results if r["signal"] == "bearish")
    neutral = sum(1 for r in results if r["signal"] == "neutral")

    return {
        "total_predictions": len(results),
        "summary": {"bullish": bullish, "bearish": bearish, "neutral": neutral},
        "predictions": results,
        "feature_importances": results[-1].get("feature_importances", []) if results else [],
    }
