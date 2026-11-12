"""Load NASA OSDR Environmental Data Application (EDA) exports.

The EDA tables for Rodent Research missions are experiment-conditions telemetry
(ISS hardware and matching ground platforms), not crew-cabin air. CrewCompass uses
them as a stand-in for a cabin sensor series and labels them that way everywhere.
"""
from __future__ import annotations

import io

import pandas as pd

from .co2 import ppm_to_mmhg

TIME_HINTS = ("controller_time", "time_gmt", "timestamp", "time", "date")
HINTS = {
    "co2_ppm": ("co2",),
    "temp_c": ("temp",),
    "humidity_pct": ("humid", "rh"),
    "dose_rate_usv_h": ("dose_rate", "dose rate", "dose_equivalent", "radiation", "dose"),
}


def _find(columns, hints, exclude=()):
    for h in hints:
        for c in columns:
            lc = str(c).lower()
            if h in lc and not any(x in lc for x in exclude):
                return c
    return None


def parse_eda_csv(raw: bytes, resample_min: int = 30) -> pd.DataFrame:
    """Parse an EDA CSV export into ts, co2_mmhg and optional series.

    Raises ValueError with the columns found when the time or CO2 column is missing.
    """
    df = pd.read_csv(io.BytesIO(raw), sep=None, engine="python")
    tcol = _find(df.columns, TIME_HINTS)
    ccol = _find(df.columns, HINTS["co2_ppm"])
    if tcol is None or ccol is None:
        raise ValueError(f"Could not find a time and a CO2 column. Columns: {list(df.columns)[:20]}")

    t = pd.to_datetime(df[tcol], utc=True, errors="coerce")
    out = pd.DataFrame({"t": t, "co2_ppm": pd.to_numeric(df[ccol], errors="coerce")})
    for name, hints in HINTS.items():
        if name == "co2_ppm":
            continue
        col = _find(df.columns, hints, exclude=("co2",))
        if col is not None:
            out[name] = pd.to_numeric(df[col], errors="coerce")
    out = out.dropna(subset=["t", "co2_ppm"]).set_index("t").sort_index()
    out = out[(out.co2_ppm > 0) & (out.co2_ppm < 30000)]
    if len(out) < 10:
        raise ValueError("Fewer than 10 usable CO2 rows after cleaning.")

    out = out.resample(f"{resample_min}min").mean().dropna(subset=["co2_ppm"])
    res = pd.DataFrame({"ts": ((out.index - pd.Timestamp("1970-01-01", tz="UTC")) // pd.Timedelta(seconds=1)).astype(int),
                        "co2_mmhg": ppm_to_mmhg(out.co2_ppm.to_numpy())})
    for name in ("temp_c", "humidity_pct", "dose_rate_usv_h"):
        res[name] = out[name].to_numpy() if name in out else float("nan")
    return res.reset_index(drop=True)


def rebase(env: pd.DataFrame, start_ts: int) -> pd.DataFrame:
    """Shift a historical series so it starts at `start_ts` (replayed on the mission clock)."""
    env = env.copy()
    env["ts"] = env.ts - int(env.ts.iloc[0]) + int(start_ts)
    return env
