"""Lagged cross-correlation of symptoms against environment series, with a shuffle test.

For each check-in at time t and each lag L (0-72 h) the exposure is the mean of an
environment series over the 24 h ending at t - L. The statistic is the largest
absolute Spearman correlation over all environment series and lags. Its p-value
comes from block-shuffling the symptom series, so the search over many lags and
series is already accounted for. Confidence is capped because fluid shift and other
drivers are not measured.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import rankdata

from . import config as C


def _exposure(env_t: np.ndarray, env_v: np.ndarray, checkin_ts: np.ndarray, lag_h: int) -> np.ndarray:
    """Mean of env_v over (t - lag - W, t - lag] for each check-in time; NaN if too sparse."""
    cs = np.concatenate([[0.0], np.cumsum(env_v)])
    end = checkin_ts - lag_h * 3600
    start = end - C.EXPOSURE_WINDOW_H * 3600
    i1 = np.searchsorted(env_t, end, side="right")
    i0 = np.searchsorted(env_t, start, side="right")
    cnt = i1 - i0
    step = np.median(np.diff(env_t)) if len(env_t) > 1 else 3600.0
    expected = max(1.0, C.EXPOSURE_WINDOW_H * 3600 / step)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = (cs[i1] - cs[i0]) / cnt
    mean[cnt < 0.5 * expected] = np.nan
    return mean


def _standardize(a: np.ndarray) -> np.ndarray:
    a = a - a.mean(axis=0)
    sd = np.sqrt((a ** 2).mean(axis=0))
    sd[sd == 0] = np.nan
    return a / sd


def _block_perms(n: int, rounds: int, block: int, rng: np.random.Generator) -> np.ndarray:
    blocks = [np.arange(i, min(i + block, n)) for i in range(0, n, block)]
    out = np.empty((rounds, n), dtype=int)
    for r in range(rounds):
        order = rng.permutation(len(blocks))
        out[r] = np.concatenate([blocks[i] for i in order])
    return out


def _confidence(p: float, r: float) -> str:
    if p < C.P_MEDIUM and abs(r) >= C.R_MEDIUM:
        return "medium"   # capped here on purpose
    if p < C.P_LOW:
        return "low"
    return "none"


def analyze(checkin_ts: np.ndarray, symptom: np.ndarray, env: pd.DataFrame,
            seed: int = 0, rounds: int = C.SHUFFLE_ROUNDS) -> dict:
    """Find the strongest lagged link between one symptom series and the environment."""
    checkin_ts = np.asarray(checkin_ts, dtype=float)
    y = np.asarray(symptom, dtype=float)
    env = env.sort_values("ts")

    cols, meta = [], []
    for name in C.ENV_SERIES:
        if name not in env:
            continue
        s = env[["ts", name]].dropna()
        if len(s) < 24:
            continue
        t, v = s.ts.to_numpy(float), s[name].to_numpy(float)
        for lag in C.LAGS_HOURS:
            cols.append(_exposure(t, v, checkin_ts, lag))
            meta.append((name, lag))
    if not cols:
        return {"status": "insufficient", "message": "No environment series available.", "n": 0}

    X = np.column_stack(cols)
    ok = ~np.isnan(X).any(axis=1) & ~np.isnan(y)
    n = int(ok.sum())
    if n < C.MIN_PAIRED_DAYS:
        return {"status": "insufficient", "n": n,
                "message": f"Need {C.MIN_PAIRED_DAYS} paired days, have {n}."}
    X, y = X[ok], y[ok]
    if np.ptp(y) == 0:
        return {"status": "insufficient", "n": n, "message": "Symptom did not vary."}

    Xr = _standardize(np.apply_along_axis(rankdata, 0, X))
    yr = _standardize(rankdata(y)[:, None])[:, 0]
    valid = ~np.isnan(Xr).any(axis=0)
    if not valid.any():
        return {"status": "insufficient", "n": n, "message": "Environment did not vary."}
    Xr = Xr[:, valid]
    meta = [m for m, v in zip(meta, valid) if v]

    r_obs = Xr.T @ yr / n
    best = int(np.argmax(np.abs(r_obs)))
    stat_obs = abs(r_obs[best])

    rng = np.random.default_rng(seed)
    perms = _block_perms(n, rounds, C.SHUFFLE_BLOCK, rng)
    r_null = (yr[perms] @ Xr) / n                    # rounds x columns
    stat_null = np.abs(r_null).max(axis=1)
    p = float((1 + (stat_null >= stat_obs).sum()) / (1 + rounds))

    env_name, lag = meta[best]
    r = float(r_obs[best])
    profile: dict[str, list] = {}
    for (name, lg), rv in zip(meta, r_obs):
        profile.setdefault(name, []).append({"lag_h": lg, "r": round(float(rv), 3)})
    return {
        "status": "ok", "n": n, "env": env_name, "env_label": C.ENV_LABELS[env_name],
        "lag_h": int(lag), "r": round(r, 3), "p": round(p, 4),
        "confidence": _confidence(p, r), "confidence_cap": C.CONFIDENCE_CAP,
        "direction": "higher" if r > 0 else "lower", "profile": profile,
        "rounds": rounds,
    }
