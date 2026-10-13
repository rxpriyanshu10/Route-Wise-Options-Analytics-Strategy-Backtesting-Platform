from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
import json
import os
from dotenv import load_dotenv
import redis

load_dotenv()
from ml_models import AnomalyDetector
from greeks import implied_volatility, compute_greeks, bs_call, bs_put, RISK_FREE_RATE
from strategies import generate_strategies, compute_custom_payoff
from backtester import backtest_strategy, optimize_strategy

app = FastAPI(title="OptionEdge Options Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "options.db"


def load_data() -> pd.DataFrame:
    """Load data from SQLite database."""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    combined = pd.read_sql_query("SELECT * FROM options", conn)
    conn.close()
    combined["datetime"] = pd.to_datetime(combined["datetime"])
    combined["expiry"] = pd.to_datetime(combined["expiry"])
    # Expiry close time for Greeks T calculation (15:30 IST market close)
    combined["expiry_close"] = combined["expiry"] + pd.Timedelta(hours=15, minutes=30)
    return combined


# Load data once at startup
df = load_data()

# Train ML models once on all available data
anomaly_detector = AnomalyDetector()
anomaly_detector.fit(df)

import time


class SafeRedisCache:
    """Resilient Redis cache with automatic in-memory fallback.
    
    If a real Redis instance is reachable, it uses Redis.
    If Redis is down or unreachable (e.g. running locally without Redis installed),
    it transparently falls back to an in-memory dictionary with TTL expiration,
    preventing ConnectionError crashes across all ML and analytics endpoints.
    """

    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0):
        self._host = host
        self._port = port
        self._db = db
        self._memory = {}
        try:
            self._client = redis.Redis(
                host=self._host,
                port=self._port,
                db=self._db,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=1.0,
            )
        except Exception:
            self._client = None

    def get(self, key: str):
        if self._client:
            try:
                return self._client.get(key)
            except Exception:
                pass
        # Fallback to local in-memory cache
        if key in self._memory:
            val, expiry = self._memory[key]
            if time.time() < expiry:
                return val
            del self._memory[key]
        return None

    def setex(self, key: str, time_seconds: int, value: str):
        if self._client:
            try:
                return self._client.setex(key, time_seconds, value)
            except Exception:
                pass
        self._memory[key] = (value, time.time() + time_seconds)
        return True


# Redis cache for ML results (TTL = 5 minutes)
rcache = SafeRedisCache(
    host=os.environ.get("REDIS_HOST", "localhost"),
    port=int(os.environ.get("REDIS_PORT", "6379")),
    db=0,
)
ML_CACHE_TTL = 300


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
    Results are cached in Redis for 5 minutes.
    """
    cache_key = f"anomalies:{expiry or 'all'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    results = anomaly_detector.predict(filtered)
    anomalies = [r for r in results if r["is_anomaly"]]
    response = {
        "total_snapshots": len(results),
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
        "all": results,
    }
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/greeks")
def get_greeks(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
    strike: Optional[float] = None,
):
    """Compute IV and Greeks for options at a given datetime snapshot.
    Returns per-strike IV, BS price, Delta, Gamma, Theta, Vega, Rho for both CE and PE.
    """
    cache_key = f"greeks:{expiry or 'all'}:{datetime_str or 'latest'}:{strike or 'all'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if datetime_str:
        filtered = filtered[filtered["datetime"] == datetime_str]
    else:
        filtered = filtered[filtered["datetime"] == filtered["datetime"].max()]
    if strike is not None:
        filtered = filtered[filtered["strike"] == strike]

    # If latest snapshot is near/at expiry close (T too small for IV solver),
    # step back to a datetime with at least ~0.5 days of T remaining
    MIN_T_SECONDS = 0.5 * 86400  # 0.5 days in seconds
    if len(filtered) > 0:
        sample_row = filtered.iloc[0]
        t_check = (sample_row["expiry_close"] - sample_row["datetime"]).total_seconds()
        if t_check < MIN_T_SECONDS:
            expiry_close_val = sample_row["expiry_close"]
            # Find datetimes where T >= MIN_T_SECONDS
            candidate_dts = df[
                (df["expiry_close"] == expiry_close_val)
                & ((df["expiry_close"] - df["datetime"]).dt.total_seconds() >= MIN_T_SECONDS)
            ]["datetime"].unique()
            if len(candidate_dts) > 0:
                prev_dt = max(candidate_dts)
                filtered = df.copy()
                if expiry:
                    filtered = filtered[filtered["expiry"] == expiry]
                filtered = filtered[filtered["datetime"] == prev_dt]
                if strike is not None:
                    filtered = filtered[filtered["strike"] == strike]

    filtered = filtered.sort_values("strike")
    r = RISK_FREE_RATE

    results = []
    for _, row in filtered.iterrows():
        S = float(row["spot_close"])
        K = float(row["strike"])
        T_days = (row["expiry_close"] - row["datetime"]).total_seconds() / 86400
        T = T_days / 365.0
        ce_price = float(row["CE"])
        pe_price = float(row["PE"])

        if T < 0.5 / 365:  # skip rows with < ~12 hours to expiry (IV unreliable)
            continue

        iv_ce = implied_volatility(ce_price, S, K, T, r, "CE")
        iv_pe = implied_volatility(pe_price, S, K, T, r, "PE")
        greeks_ce = compute_greeks(S, K, T, r, iv_ce, "CE")
        greeks_pe = compute_greeks(S, K, T, r, iv_pe, "PE")

        entry = {
            "datetime": str(row["datetime"]),
            "strike": K,
            "spot_close": S,
            "T_days": round(T_days, 2),
            "ce_price": ce_price,
            "pe_price": pe_price,
            "iv_CE": round(iv_ce * 100, 2) if not np.isnan(iv_ce) else None,
            "iv_PE": round(iv_pe * 100, 2) if not np.isnan(iv_pe) else None,
            "bs_CE": round(bs_call(S, K, T, r, iv_ce), 2) if not np.isnan(iv_ce) else None,
            "bs_PE": round(bs_put(S, K, T, r, iv_pe), 2) if not np.isnan(iv_pe) else None,
        }
        for g, v in greeks_ce.items():
            entry[f"{g}_CE"] = v if not np.isnan(v) else None
        for g, v in greeks_pe.items():
            entry[f"{g}_PE"] = v if not np.isnan(v) else None

        results.append(entry)

    response = {"count": len(results), "data": results}
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/iv-surface")
def get_iv_surface(expiry: Optional[str] = None):
    """IV surface: implied volatility across strikes and time.
    Returns a grid of (datetime, strike, iv_CE, iv_PE) for 3D surface plotting.
    """
    cache_key = f"iv_surface:{expiry or 'all'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    # Sample: take every Nth datetime to keep response size manageable
    datetimes = sorted(filtered["datetime"].unique())
    step = max(1, len(datetimes) // 50)
    sampled_dts = datetimes[::step]
    filtered = filtered[filtered["datetime"].isin(sampled_dts)]

    # Focus on strikes near ATM (+-10 strikes)
    atm = filtered["ATM"].mode().iloc[0] if len(filtered) > 0 else 25000
    strikes = sorted(filtered["strike"].unique())
    atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - atm))
    near_strikes = strikes[max(0, atm_idx - 10):atm_idx + 11]
    filtered = filtered[filtered["strike"].isin(near_strikes)]

    r = RISK_FREE_RATE
    surface = []
    for _, row in filtered.iterrows():
        S = float(row["spot_close"])
        K = float(row["strike"])
        T = (row["expiry_close"] - row["datetime"]).total_seconds() / (86400 * 365)
        if T < 0.5 / 365:
            continue
        iv_ce = implied_volatility(float(row["CE"]), S, K, T, r, "CE")
        iv_pe = implied_volatility(float(row["PE"]), S, K, T, r, "PE")
        surface.append({
            "datetime": str(row["datetime"]),
            "strike": K,
            "T_days": round(T * 365, 2),
            "iv_CE": round(iv_ce * 100, 2) if not np.isnan(iv_ce) else None,
            "iv_PE": round(iv_pe * 100, 2) if not np.isnan(iv_pe) else None,
        })

    response = {"count": len(surface), "data": surface}
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/option-chain")
def get_option_chain(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
):
    """Option chain: consolidated per-strike view with CE/PE prices, OI, volume, IV, Greeks."""
    cache_key = f"chain:{expiry or 'all'}:{datetime_str or 'latest'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if datetime_str:
        filtered = filtered[filtered["datetime"] == datetime_str]
    else:
        filtered = filtered[filtered["datetime"] == filtered["datetime"].max()]

    if len(filtered) == 0:
        return {"spot": None, "atm": None, "datetime": None, "expiry": None, "chain": []}

    spot = float(filtered["spot_close"].iloc[0])
    atm = float(filtered["ATM"].iloc[0])
    dt_str = str(filtered["datetime"].iloc[0])
    exp_str = str(filtered["expiry"].iloc[0])
    r = RISK_FREE_RATE

    chain = []
    for _, row in filtered.sort_values("strike").iterrows():
        S = float(row["spot_close"])
        K = float(row["strike"])
        T = (row["expiry_close"] - row["datetime"]).total_seconds() / (86400 * 365)
        ce = float(row["CE"])
        pe = float(row["PE"])

        ce_greeks = {"iv": None, "delta": None, "gamma": None, "theta": None, "vega": None}
        pe_greeks = {"iv": None, "delta": None, "gamma": None, "theta": None, "vega": None}

        if T >= 0.5 / 365:
            _iv_ce = implied_volatility(ce, S, K, T, r, "CE")
            _iv_pe = implied_volatility(pe, S, K, T, r, "PE")
            if not np.isnan(_iv_ce):
                ce_greeks["iv"] = round(_iv_ce * 100, 2)
                g = compute_greeks(S, K, T, r, _iv_ce, "CE")
                ce_greeks.update({k: g[k] for k in g})
            if not np.isnan(_iv_pe):
                pe_greeks["iv"] = round(_iv_pe * 100, 2)
                g = compute_greeks(S, K, T, r, _iv_pe, "PE")
                pe_greeks.update({k: g[k] for k in g})

        chain.append({
            "strike": K,
            "ce_price": ce,
            "ce_oi": int(row["oi_CE"]),
            "ce_volume": int(row["volume_CE"]),
            "ce_iv": ce_greeks["iv"],
            "ce_delta": ce_greeks["delta"],
            "ce_gamma": ce_greeks["gamma"],
            "ce_theta": ce_greeks["theta"],
            "ce_vega": ce_greeks["vega"],
            "pe_price": pe,
            "pe_oi": int(row["oi_PE"]),
            "pe_volume": int(row["volume_PE"]),
            "pe_iv": pe_greeks["iv"],
            "pe_delta": pe_greeks["delta"],
            "pe_gamma": pe_greeks["gamma"],
            "pe_theta": pe_greeks["theta"],
            "pe_vega": pe_greeks["vega"],
        })

    response = {
        "spot": spot,
        "atm": atm,
        "datetime": dt_str,
        "expiry": exp_str,
        "chain": chain,
    }
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/parity-arbitrage")
def get_parity_arbitrage(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
    threshold: float = Query(5.0, description="Min mispricing in points to flag as arbitrage"),
):
    """Put-Call Parity check and arbitrage opportunity detection.

    Put-Call Parity: C - P = S - K * e^(-rT)
    Mispricing = (C - P) - (S - K * e^(-rT))

    If mispricing > 0: call is overpriced -> sell call, buy put, buy underlying
    If mispricing < 0: put is overpriced -> sell put, buy call, short underlying
    """
    cache_key = f"parity:{expiry or 'all'}:{datetime_str or 'latest'}:{threshold}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    if datetime_str:
        filtered = filtered[filtered["datetime"] == datetime_str]
    else:
        filtered = filtered[filtered["datetime"] == filtered["datetime"].max()]

    # If latest snapshot is near/at expiry close (T too small), step back
    MIN_T_SECONDS = 0.5 * 86400  # 0.5 days
    if len(filtered) > 0:
        sample_row = filtered.iloc[0]
        t_check = (sample_row["expiry_close"] - sample_row["datetime"]).total_seconds()
        if t_check < MIN_T_SECONDS:
            expiry_close_val = sample_row["expiry_close"]
            candidate_dts = df[
                (df["expiry_close"] == expiry_close_val)
                & ((df["expiry_close"] - df["datetime"]).dt.total_seconds() >= MIN_T_SECONDS)
            ]["datetime"].unique()
            if len(candidate_dts) > 0:
                prev_dt = max(candidate_dts)
                filtered = df.copy()
                if expiry:
                    filtered = filtered[filtered["expiry"] == expiry]
                filtered = filtered[filtered["datetime"] == prev_dt]

    filtered = filtered.sort_values("strike")
    r = RISK_FREE_RATE

    results = []
    opportunities = []

    for _, row in filtered.iterrows():
        S = float(row["spot_close"])
        K = float(row["strike"])
        T = (row["expiry_close"] - row["datetime"]).total_seconds() / (86400 * 365)
        ce = float(row["CE"])
        pe = float(row["PE"])

        if T < 0.5 / 365:
            continue

        pv_strike = K * np.exp(-r * T)
        theoretical_diff = S - pv_strike  # C - P should equal this
        actual_diff = ce - pe
        mispricing = actual_diff - theoretical_diff
        mispricing_pct = (mispricing / S) * 100 if S > 0 else 0

        entry = {
            "datetime": str(row["datetime"]),
            "strike": K,
            "spot_close": S,
            "T_days": round(T * 365, 2),
            "ce_price": ce,
            "pe_price": pe,
            "pv_strike": round(pv_strike, 2),
            "theoretical_diff": round(theoretical_diff, 2),
            "actual_diff": round(actual_diff, 2),
            "mispricing": round(mispricing, 2),
            "mispricing_pct": round(mispricing_pct, 4),
        }

        if abs(mispricing) >= threshold:
            if mispricing > 0:
                entry["signal"] = "call_overpriced"
                entry["strategy"] = "Sell CE + Buy PE + Buy Spot (conversion)"
            else:
                entry["signal"] = "put_overpriced"
                entry["strategy"] = "Sell PE + Buy CE + Short Spot (reversal)"
            entry["potential_profit"] = round(abs(mispricing), 2)
            opportunities.append(entry)

        results.append(entry)

    opportunities.sort(key=lambda x: abs(x["mispricing"]), reverse=True)

    response = {
        "total_strikes": len(results),
        "arbitrage_count": len(opportunities),
        "threshold": threshold,
        "opportunities": opportunities[:20],
        "all": results,
    }
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/activity-heatmap")
def get_activity_heatmap(
    expiry: Optional[str] = None,
    metric: str = Query("oi_CE", description="Metric: oi_CE, oi_PE, volume_CE, volume_PE"),
):
    """Activity heatmap: metric values across strikes and time snapshots."""
    cache_key = f"heatmap:{expiry or 'all'}:{metric}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]

    if metric not in ("oi_CE", "oi_PE", "volume_CE", "volume_PE"):
        return {"error": "Invalid metric"}

    # Sample datetimes to keep response manageable
    datetimes = sorted(filtered["datetime"].unique())
    step = max(1, len(datetimes) // 60)
    sampled_dts = datetimes[::step]
    filtered = filtered[filtered["datetime"].isin(sampled_dts)]

    # Focus on strikes near ATM (+-12 strikes)
    atm = filtered["ATM"].mode().iloc[0] if len(filtered) > 0 else 25000
    strikes = sorted(filtered["strike"].unique())
    if len(strikes) == 0:
        return {"count": 0, "data": [], "atm": atm}
    atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - atm))
    near_strikes = strikes[max(0, atm_idx - 12):atm_idx + 13]
    filtered = filtered[filtered["strike"].isin(near_strikes)]

    data = []
    for _, row in filtered.iterrows():
        val = float(row[metric])
        data.append({
            "datetime": str(row["datetime"]),
            "strike": float(row["strike"]),
            "value": val,
        })

    response = {"count": len(data), "data": data, "atm": atm, "metric": metric}
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.get("/api/strategies")
def get_strategies(
    expiry: Optional[str] = None,
    datetime_str: Optional[str] = Query(None, alias="datetime"),
):
    """Generate all predefined option strategies from current option chain."""
    cache_key = f"strategies:{expiry or 'all'}:{datetime_str or 'latest'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    # Get option chain data
    chain = get_option_chain(expiry=expiry, datetime_str=datetime_str)
    if not chain.get("chain"):
        return {"strategies": [], "spot": None, "atm": None}

    strategies = generate_strategies(chain["chain"], chain["spot"], chain["atm"])

    response = {
        "spot": chain["spot"],
        "atm": chain["atm"],
        "datetime": chain["datetime"],
        "expiry": chain["expiry"],
        "strategies": strategies,
    }
    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(response))
    return response


@app.post("/api/strategy-payoff")
def post_strategy_payoff(payload: dict):
    """Compute payoff diagram for user-defined strategy legs.

    Body: { "legs": [...], "spot": float }
    Each leg: { "type": "CE"/"PE", "strike": float, "action": "buy"/"sell", "qty": int, "premium": float }
    """
    legs = payload.get("legs", [])
    spot = payload.get("spot", 0)
    if not legs:
        return {"error": "No legs provided"}
    result = compute_custom_payoff(legs, spot)
    return result


@app.get("/api/backtest")
def run_backtest(
    expiry: Optional[str] = None,
    strategy_id: Optional[str] = None,
    entry_datetime: Optional[str] = Query(None, alias="entry"),
    exit_datetime: Optional[str] = Query(None, alias="exit"),
):
    """Run a backtest for a predefined strategy.

    1. Fetches option chain at entry_datetime
    2. Generates the strategy
    3. Walks through all subsequent snapshots computing P&L
    """
    if not expiry or not strategy_id or not entry_datetime:
        return {"error": "expiry, strategy_id, and entry datetime are required"}

    cache_key = f"backtest:{expiry}:{strategy_id}:{entry_datetime}:{exit_datetime or 'end'}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    # Get strategies at entry point
    strats_resp = get_strategies(expiry=expiry, datetime_str=entry_datetime)
    strategies = strats_resp.get("strategies", [])
    target = next((s for s in strategies if s["id"] == strategy_id), None)
    if not target:
        return {"error": f"Strategy '{strategy_id}' not found at entry datetime"}

    # Build legs for backtester
    legs = [
        {
            "type": leg["type"],
            "strike": leg["strike"],
            "action": leg["action"],
            "qty": leg["qty"],
            "premium": leg["premium"],
        }
        for leg in target["legs"]
    ]

    result = backtest_strategy(
        df=df,
        legs=legs,
        entry_datetime=entry_datetime,
        expiry=expiry,
        exit_datetime=exit_datetime,
    )

    result["strategy"] = {
        "id": target["id"],
        "name": target["name"],
        "sentiment": target["sentiment"],
        "legs": target["legs"],
        "net_premium": target["net_premium"],
    }

    rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(result))
    return result


@app.post("/api/backtest/custom")
def run_custom_backtest(payload: dict):
    """Run a backtest for user-defined strategy legs.

    Body: {
        "expiry": str,
        "entry": str (datetime),
        "exit": str (datetime, optional),
        "legs": [{ "type": "CE"/"PE", "strike": float, "action": "buy"/"sell", "qty": int, "premium": float }]
    }
    """
    expiry = payload.get("expiry")
    entry_datetime = payload.get("entry")
    exit_datetime = payload.get("exit")
    legs = payload.get("legs", [])

    if not expiry or not entry_datetime or not legs:
        return {"error": "expiry, entry datetime, and legs are required"}

    result = backtest_strategy(
        df=df,
        legs=legs,
        entry_datetime=entry_datetime,
        expiry=expiry,
        exit_datetime=exit_datetime,
    )

    result["strategy"] = {
        "id": "custom",
        "name": "Custom Strategy",
        "sentiment": "custom",
        "legs": legs,
        "net_premium": round(sum(
            (-1 if l["action"] == "buy" else 1) * l["premium"] * l.get("qty", 1)
            for l in legs
        ), 2),
    }
    return result


@app.get("/api/backtest/datetimes")
def get_backtest_datetimes(expiry: Optional[str] = None):
    """Get available entry datetimes for backtesting (sampled for UI)."""
    filtered = df.copy()
    if expiry:
        filtered = filtered[filtered["expiry"] == expiry]
    dts = sorted(filtered["datetime"].unique())
    # Sample to keep list manageable
    step = max(1, len(dts) // 200)
    sampled = dts[::step]
    return [str(dt) for dt in sampled]


@app.get("/api/strategy/optimize")
def optimize_strategy_endpoint(
    expiry: Optional[str] = None,
    strategy_id: Optional[str] = None,
):
    """Find the best entry time and holding period for a strategy."""
    if not expiry or not strategy_id:
        return {"error": "expiry and strategy_id are required"}

    cache_key = f"optimize:{expiry}:{strategy_id}"
    cached = rcache.get(cache_key)
    if cached:
        return json.loads(cached)

    result = optimize_strategy(
        df=df,
        strategy_id=strategy_id,
        expiry=expiry,
        get_option_chain_fn=get_option_chain,
    )

    if "error" not in result:
        rcache.setex(cache_key, ML_CACHE_TTL, json.dumps(result))
    return result


