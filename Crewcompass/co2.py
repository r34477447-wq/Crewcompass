"""CO2 unit conversion and averaging against NASA guidance."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def ppm_to_mmhg(ppm):
    return np.asarray(ppm, dtype=float) * C.MMHG_PER_PPM


def mmhg_to_ppm(mmhg):
    return np.asarray(mmhg, dtype=float) / C.MMHG_PER_PPM


def _window_mean(df: pd.DataFrame, end_ts: int, hours: float, min_cover: float = 0.5):
    """Mean CO2 (mmHg) over the window ending at end_ts, with a coverage check."""
    w = df[(df.ts > end_ts - hours * 3600) & (df.ts <= end_ts)]
    if w.empty:
        return None, 0.0
    step = float(np.median(np.diff(df.ts))) if len(df) > 1 else 3600.0
    expected = max(1.0, hours * 3600 / step)
    cover = min(1.0, len(w) / expected)
    if cover < min_cover:
        return None, cover
    return float(w.co2_mmhg.mean()), cover


def summarize(env: pd.DataFrame) -> dict:
    """Current CO2 picture. `env` needs columns ts (epoch s) and co2_mmhg."""
    env = env.dropna(subset=["co2_mmhg"]).sort_values("ts")
    if env.empty:
        return {"available": False, "status": "no_data", "message": "No CO2 data yet."}
    now = int(env.ts.iloc[-1])
    m1, c1 = _window_mean(env, now, 1)
    m24, c24 = _window_mean(env, now, 24)
    m7, c7 = _window_mean(env, now, 24 * 7)
    latest = float(env.co2_mmhg.iloc[-1])

    status, message = "nominal", "7-day average is within guidance."
    if m1 is not None and m1 >= C.CO2_LIMIT_MMHG:
        status, message = "above_limit", "1-hour average is at or above the 3 mmHg limit."
    elif m7 is not None and m7 >= C.CO2_LIMIT_MMHG:
        status, message = "above_limit", "7-day average is at or above the 3 mmHg limit."
    elif m7 is not None and m7 >= C.CO2_GUIDANCE_7D_MMHG:
        status, message = "above_guidance", "7-day average is above the 2.5 mmHg guidance."
    elif m7 is not None and m7 >= C.CO2_WATCH_MMHG:
        status, message = "watch", "7-day average is approaching the 2.5 mmHg guidance."
    elif m7 is None:
        status, message = "insufficient", "Not enough data for a 7-day average yet."

    r = lambda v: None if v is None else round(v, 3)
    return {
        "available": True, "as_of": now, "status": status, "message": message,
        "latest_mmhg": r(latest), "latest_ppm": round(float(mmhg_to_ppm(latest))),
        "mean_1h_mmhg": r(m1), "mean_24h_mmhg": r(m24), "mean_7d_mmhg": r(m7),
        "peak_mmhg": r(float(env.co2_mmhg.max())),
        "coverage_7d": round(c7, 2),
        "thresholds": {"guidance_7d_mmhg": C.CO2_GUIDANCE_7D_MMHG,
                       "limit_mmhg": C.CO2_LIMIT_MMHG, "watch_mmhg": C.CO2_WATCH_MMHG},
        "thresholds_ppm": {"guidance_7d": round(float(mmhg_to_ppm(C.CO2_GUIDANCE_7D_MMHG))),
                           "limit": round(float(mmhg_to_ppm(C.CO2_LIMIT_MMHG)))},
    }
