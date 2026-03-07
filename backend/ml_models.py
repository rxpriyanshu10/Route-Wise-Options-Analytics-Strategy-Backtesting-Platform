"""
ML models for options analytics.
All features are relative/normalized so models generalize to new expiries without retraining.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler


def _build_snapshot_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build per-datetime snapshot features from raw options data.
    All features are relative/normalized — no absolute strikes or prices.
    """
    snapshots = []

    for dt, group in df.groupby("datetime"):
        spot = group["spot_close"].iloc[0]
        atm = group["ATM"].iloc[0]
        total_oi_ce = group["oi_CE"].sum()
        total_oi_pe = group["oi_PE"].sum()
        total_vol_ce = group["volume_CE"].sum()
        total_vol_pe = group["volume_PE"].sum()

        # PCR
        pcr_oi = total_oi_pe / max(total_oi_ce, 1)
        pcr_vol = total_vol_pe / max(total_vol_ce, 1)

        # OI concentration: how much OI is at ATM vs spread across strikes
        atm_rows = group[group["strike"] == atm]
        atm_oi_ce = atm_rows["oi_CE"].sum()
        atm_oi_pe = atm_rows["oi_PE"].sum()
        oi_concentration_ce = atm_oi_ce / max(total_oi_ce, 1)
        oi_concentration_pe = atm_oi_pe / max(total_oi_pe, 1)

        # Max OI strike distance from spot (normalized by spot)
        max_ce_oi_strike = group.loc[group["oi_CE"].idxmax(), "strike"] if total_oi_ce > 0 else spot
        max_pe_oi_strike = group.loc[group["oi_PE"].idxmax(), "strike"] if total_oi_pe > 0 else spot
        max_ce_oi_dist = (max_ce_oi_strike - spot) / spot
        max_pe_oi_dist = (spot - max_pe_oi_strike) / spot

        # Volume/OI ratio (activity intensity)
        vol_oi_ratio_ce = total_vol_ce / max(total_oi_ce, 1)
        vol_oi_ratio_pe = total_vol_pe / max(total_oi_pe, 1)

        # ATM straddle premium as % of spot
        atm_ce_price = atm_rows["CE"].mean() if len(atm_rows) > 0 else 0
        atm_pe_price = atm_rows["PE"].mean() if len(atm_rows) > 0 else 0
        straddle_pct = (atm_ce_price + atm_pe_price) / spot

        # OI skew: ratio of total CE OI to total PE OI above vs below ATM
        above_atm = group[group["strike"] > atm]
        below_atm = group[group["strike"] < atm]
        oi_skew_above = above_atm["oi_CE"].sum() / max(above_atm["oi_PE"].sum(), 1)
        oi_skew_below = below_atm["oi_PE"].sum() / max(below_atm["oi_CE"].sum(), 1)

        snapshots.append({
            "datetime": dt,
            "spot": spot,
            "pcr_oi": pcr_oi,
            "pcr_vol": pcr_vol,
            "oi_concentration_ce": oi_concentration_ce,
            "oi_concentration_pe": oi_concentration_pe,
            "max_ce_oi_dist": max_ce_oi_dist,
            "max_pe_oi_dist": max_pe_oi_dist,
            "vol_oi_ratio_ce": vol_oi_ratio_ce,
            "vol_oi_ratio_pe": vol_oi_ratio_pe,
            "straddle_pct": straddle_pct,
            "oi_skew_above": oi_skew_above,
            "oi_skew_below": oi_skew_below,
            "total_oi": total_oi_ce + total_oi_pe,
            "total_volume": total_vol_ce + total_vol_pe,
        })

    feat_df = pd.DataFrame(snapshots).sort_values("datetime").reset_index(drop=True)

    # Rolling features (changes over time — also relative)
    feat_df["pcr_oi_change"] = feat_df["pcr_oi"].diff().fillna(0)
    feat_df["pcr_vol_change"] = feat_df["pcr_vol"].diff().fillna(0)
    feat_df["spot_return"] = feat_df["spot"].pct_change().fillna(0)
    feat_df["oi_change_pct"] = feat_df["total_oi"].pct_change().fillna(0)
    feat_df["volume_change_pct"] = feat_df["total_volume"].pct_change().fillna(0)
    feat_df["straddle_pct_change"] = feat_df["straddle_pct"].diff().fillna(0)

    return feat_df


FEATURE_COLS = [
    "pcr_oi", "pcr_vol",
    "oi_concentration_ce", "oi_concentration_pe",
    "max_ce_oi_dist", "max_pe_oi_dist",
    "vol_oi_ratio_ce", "vol_oi_ratio_pe",
    "straddle_pct",
    "oi_skew_above", "oi_skew_below",
    "pcr_oi_change", "pcr_vol_change",
    "spot_return", "oi_change_pct", "volume_change_pct",
    "straddle_pct_change",
]


class AnomalyDetector:
    """Isolation Forest on normalized options features. Detects unusual market activity."""

    def __init__(self):
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.05,  # top 5% most anomalous
            random_state=42,
        )
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(self, df: pd.DataFrame):
        feat_df = _build_snapshot_features(df)
        X = feat_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0).values
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)
        self.model.fit(X_scaled)
        self.is_fitted = True

    def predict(self, df: pd.DataFrame) -> list[dict]:
        """Run anomaly detection on data (can be new expiry)."""
        feat_df = _build_snapshot_features(df)
        X = feat_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0).values
        X_scaled = self.scaler.transform(X)

        scores = self.model.decision_function(X_scaled)
        labels = self.model.predict(X_scaled)  # -1 = anomaly, 1 = normal

        # Normalize scores to 0-100 (higher = more anomalous)
        min_s, max_s = scores.min(), scores.max()
        if max_s > min_s:
            anomaly_score = ((max_s - scores) / (max_s - min_s) * 100).round(1)
        else:
            anomaly_score = np.zeros(len(scores))

        results = []
        for i in range(len(feat_df)):
            row = feat_df.iloc[i]
            results.append({
                "datetime": row["datetime"].strftime("%Y-%m-%d %H:%M:%S"),
                "anomaly_score": float(anomaly_score[i]),
                "is_anomaly": bool(labels[i] == -1),
                "spot": float(row["spot"]),
                "pcr_oi": round(float(row["pcr_oi"]), 4),
                "pcr_vol": round(float(row["pcr_vol"]), 4),
                "vol_oi_ratio_ce": round(float(row["vol_oi_ratio_ce"]), 4),
                "vol_oi_ratio_pe": round(float(row["vol_oi_ratio_pe"]), 4),
                "oi_change_pct": round(float(row["oi_change_pct"]) * 100, 2),
                "volume_change_pct": round(float(row["volume_change_pct"]) * 100, 2),
            })

        return results


class DirectionPredictor:
    """
    Random Forest classifier predicting next-period spot direction from options flow.
    Uses only relative features — works on unseen expiries.
    """

    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=5,
            random_state=42,
            class_weight="balanced",
        )
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(self, df: pd.DataFrame):
        feat_df = _build_snapshot_features(df)

        # Label: future spot direction (next row's return)
        feat_df["future_return"] = feat_df["spot"].shift(-1) / feat_df["spot"] - 1
        feat_df["label"] = 0  # neutral
        feat_df.loc[feat_df["future_return"] > 0.001, "label"] = 1  # bullish
        feat_df.loc[feat_df["future_return"] < -0.001, "label"] = -1  # bearish

        # Drop last row (no future) and first row (no diff features)
        feat_df = feat_df.iloc[1:-1].reset_index(drop=True)

        X = feat_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0).values
        y = feat_df["label"].values

        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)
        self.model.fit(X_scaled, y)
        self.is_fitted = True

    def predict(self, df: pd.DataFrame) -> list[dict]:
        """Predict direction for each snapshot (can be new expiry)."""
        feat_df = _build_snapshot_features(df)
        X = feat_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0).values
        X_scaled = self.scaler.transform(X)

        predictions = self.model.predict(X_scaled)
        probas = self.model.predict_proba(X_scaled)
        classes = self.model.classes_  # e.g., [-1, 0, 1]

        results = []
        for i in range(len(feat_df)):
            row = feat_df.iloc[i]
            pred = int(predictions[i])
            signal = "bullish" if pred == 1 else "bearish" if pred == -1 else "neutral"

            proba_dict = {}
            for j, cls in enumerate(classes):
                label = "bullish" if cls == 1 else "bearish" if cls == -1 else "neutral"
                proba_dict[label] = round(float(probas[i][j]) * 100, 1)

            # Top contributing features
            feature_importances = dict(zip(FEATURE_COLS, self.model.feature_importances_))
            top_features = sorted(feature_importances.items(), key=lambda x: x[1], reverse=True)[:5]

            results.append({
                "datetime": row["datetime"].strftime("%Y-%m-%d %H:%M:%S"),
                "signal": signal,
                "confidence": proba_dict.get(signal, 0),
                "probabilities": proba_dict,
                "spot": float(row["spot"]),
                "pcr_oi": round(float(row["pcr_oi"]), 4),
                "straddle_pct": round(float(row["straddle_pct"]) * 100, 2),
            })

        # Attach feature importances to the last item
        if results:
            results[-1]["feature_importances"] = [
                {"feature": f, "importance": round(imp * 100, 1)} for f, imp in top_features
            ]

        return results
