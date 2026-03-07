"""Black-Scholes pricing, implied volatility, and option Greeks."""

import numpy as np
from scipy.stats import norm

# Risk-free rate (annualized) — approximate RBI repo rate
RISK_FREE_RATE = 0.065


def _d1(S, K, T, r, sigma):
    return (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))


def _d2(S, K, T, r, sigma):
    return _d1(S, K, T, r, sigma) - sigma * np.sqrt(T)


def bs_call(S, K, T, r, sigma):
    """Black-Scholes call price."""
    d1 = _d1(S, K, T, r, sigma)
    d2 = d1 - sigma * np.sqrt(T)
    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


def bs_put(S, K, T, r, sigma):
    """Black-Scholes put price."""
    d1 = _d1(S, K, T, r, sigma)
    d2 = d1 - sigma * np.sqrt(T)
    return K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)


def implied_volatility(market_price, S, K, T, r, option_type="CE", max_iter=100, tol=1e-6):
    """Newton-Raphson implied volatility solver.

    Returns IV as a decimal (e.g. 0.15 = 15%). Returns NaN if it fails to converge.
    """
    if T <= 0 or market_price <= 0 or S <= 0 or K <= 0:
        return np.nan

    # Intrinsic value check
    if option_type == "CE":
        intrinsic = max(S - K * np.exp(-r * T), 0)
    else:
        intrinsic = max(K * np.exp(-r * T) - S, 0)

    if market_price < intrinsic:
        return np.nan

    # Initial guess using Brenner-Subrahmanyam approximation
    sigma = np.sqrt(2 * np.pi / T) * market_price / S
    sigma = max(min(sigma, 5.0), 0.01)

    pricer = bs_call if option_type == "CE" else bs_put

    for _ in range(max_iter):
        price = pricer(S, K, T, r, sigma)
        vega = _vega(S, K, T, r, sigma)

        if vega < 1e-12:
            break

        diff = price - market_price
        sigma -= diff / vega

        if sigma <= 0:
            sigma = 0.001

        if abs(diff) < tol:
            return sigma

    if abs(pricer(S, K, T, r, sigma) - market_price) / market_price < 0.05 and sigma < 5.0:
        return sigma
    return np.nan


# --- Greeks ---

def _vega(S, K, T, r, sigma):
    """Vega: sensitivity to volatility (per 1 unit change in sigma)."""
    d1 = _d1(S, K, T, r, sigma)
    return S * np.sqrt(T) * norm.pdf(d1)


def delta(S, K, T, r, sigma, option_type="CE"):
    d1 = _d1(S, K, T, r, sigma)
    if option_type == "CE":
        return norm.cdf(d1)
    else:
        return norm.cdf(d1) - 1


def gamma(S, K, T, r, sigma):
    d1 = _d1(S, K, T, r, sigma)
    return norm.pdf(d1) / (S * sigma * np.sqrt(T))


def theta(S, K, T, r, sigma, option_type="CE"):
    """Theta: time decay per calendar day."""
    d1 = _d1(S, K, T, r, sigma)
    d2 = d1 - sigma * np.sqrt(T)
    common = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
    if option_type == "CE":
        return (common - r * K * np.exp(-r * T) * norm.cdf(d2)) / 365
    else:
        return (common + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 365


def vega(S, K, T, r, sigma):
    """Vega per 1% change in IV."""
    return _vega(S, K, T, r, sigma) / 100


def rho(S, K, T, r, sigma, option_type="CE"):
    """Rho per 1% change in rate."""
    d2 = _d2(S, K, T, r, sigma)
    if option_type == "CE":
        return K * T * np.exp(-r * T) * norm.cdf(d2) / 100
    else:
        return -K * T * np.exp(-r * T) * norm.cdf(-d2) / 100


def compute_greeks(S, K, T, r, sigma, option_type="CE"):
    """Compute all Greeks for a single option."""
    if np.isnan(sigma) or sigma <= 0 or T <= 0:
        return {"delta": np.nan, "gamma": np.nan, "theta": np.nan, "vega": np.nan, "rho": np.nan}

    return {
        "delta": round(delta(S, K, T, r, sigma, option_type), 6),
        "gamma": round(gamma(S, K, T, r, sigma), 6),
        "theta": round(theta(S, K, T, r, sigma, option_type), 4),
        "vega": round(vega(S, K, T, r, sigma), 4),
        "rho": round(rho(S, K, T, r, sigma, option_type), 4),
    }


def compute_for_dataframe(df):
    """Compute IV and Greeks for every row in the options DataFrame.

    Expects columns: spot_close, strike, datetime, expiry, CE, PE.
    Returns a new DataFrame with IV and Greeks for both CE and PE.
    """
    import pandas as pd

    dt = pd.to_datetime(df["datetime"])
    exp = pd.to_datetime(df["expiry"])
    # Time to expiry in years (using trading days: 252 per year)
    T_days = (exp - dt).dt.total_seconds() / 86400
    T_years = T_days / 365.0

    results = []
    r = RISK_FREE_RATE

    for i in range(len(df)):
        S = float(df.iloc[i]["spot_close"])
        K = float(df.iloc[i]["strike"])
        T = float(T_years.iloc[i])
        ce_price = float(df.iloc[i]["CE"])
        pe_price = float(df.iloc[i]["PE"])

        row = {
            "datetime": str(df.iloc[i]["datetime"]),
            "strike": K,
            "spot_close": S,
            "T_days": round(T_days.iloc[i], 2),
            "ce_price": ce_price,
            "pe_price": pe_price,
        }

        # CE side
        iv_ce = implied_volatility(ce_price, S, K, T, r, "CE")
        row["iv_CE"] = round(iv_ce * 100, 2) if not np.isnan(iv_ce) else None
        bs_ce = round(bs_call(S, K, T, r, iv_ce), 2) if not np.isnan(iv_ce) else None
        row["bs_CE"] = bs_ce
        greeks_ce = compute_greeks(S, K, T, r, iv_ce, "CE")
        for g, v in greeks_ce.items():
            row[f"{g}_CE"] = v if not np.isnan(v) else None

        # PE side
        iv_pe = implied_volatility(pe_price, S, K, T, r, "PE")
        row["iv_PE"] = round(iv_pe * 100, 2) if not np.isnan(iv_pe) else None
        bs_pe = round(bs_put(S, K, T, r, iv_pe), 2) if not np.isnan(iv_pe) else None
        row["bs_PE"] = bs_pe
        greeks_pe = compute_greeks(S, K, T, r, iv_pe, "PE")
        for g, v in greeks_pe.items():
            row[f"{g}_PE"] = v if not np.isnan(v) else None

        results.append(row)

    return results
