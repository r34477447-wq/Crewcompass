"""Simulated crew and cabin data, always labelled "simulated" in the app.

Individual astronaut health records are not public, so symptoms must be simulated.
The simulator can PLANT a known CO2 -> headache link (with a known lag), which gives
ground truth for validating the analysis: it should find a planted link and stay
quiet when none is planted.

The link strength below is illustrative. Before any real claim, calibrate it against
the CO2 / headache analysis in NASA's technical brief OCHMO-TB-004.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config as C
from .co2 import ppm_to_mmhg

CREW = [
    {"callsign": "Altair", "role": "Commander"},
    {"callsign": "Vega", "role": "Flight Engineer"},
    {"callsign": "Lyra", "role": "Science Officer"},
    {"callsign": "Orion", "role": "Medical Officer"},
]
STEP_MIN = 30
CHECKIN_HOUR = 8


@dataclass
class SimConfig:
    days: int = 60
    seed: int = 7
    planted: bool = True
    lag_hours: int = 12          # true lag of the planted link
    strength: float = 6.0        # headache points per mmHg above the knee (illustrative)
    knee_mmhg: float = 2.15      # exposure below this has no effect (illustrative)
    start_ts: int = 1_760_000_000  # 2025-10-09 UTC; any fixed start works


def simulate_environment(cfg: SimConfig) -> pd.DataFrame:
    rng = np.random.default_rng(cfg.seed)
    n = int(cfg.days * 24 * 60 / STEP_MIN)
    ts = cfg.start_ts + np.arange(n) * STEP_MIN * 60
    hours = np.arange(n) * STEP_MIN / 60

    ar = np.zeros(n)
    for i in range(1, n):
        ar[i] = 0.97 * ar[i - 1] + rng.normal(0, 38)
    co2_ppm = 2900 + 230 * np.sin(2 * np.pi * (hours - 6) / 24) + ar
    # scrubber / ventilation events: a few hours to a day of elevated CO2
    for _ in range(max(3, cfg.days // 5)):
        start = rng.integers(48, max(60, n - 90))
        length = rng.integers(10, 36)
        bump = rng.uniform(700, 1300)
        co2_ppm[start:start + length] += bump * np.hanning(min(length, n - start) + 2)[1:-1][: min(length, n - start)]
    temp = 22.4 + 0.5 * np.sin(2 * np.pi * hours / 24) + np.cumsum(rng.normal(0, 0.01, n)) * 0.2
    hum = 44 + 3 * np.sin(2 * np.pi * (hours - 3) / 24) + rng.normal(0, 0.8, n)
    # radiation dose rate with periodic enhanced passes (simulated stand-in)
    dose = 22 + 6 * (np.sin(2 * np.pi * hours / 1.55) > 0.8) + rng.normal(0, 1.2, n)
    return pd.DataFrame({
        "ts": ts.astype(int), "co2_mmhg": ppm_to_mmhg(co2_ppm), "temp_c": temp,
        "humidity_pct": hum, "dose_rate_usv_h": np.clip(dose, 8, None), "source": "simulated",
    })


def _exposure_at(env: pd.DataFrame, t: int, lag_h: int) -> float:
    end = t - lag_h * 3600
    w = env[(env.ts > end - C.EXPOSURE_WINDOW_H * 3600) & (env.ts <= end)]
    return float(w.co2_mmhg.mean()) if len(w) else float("nan")


def simulate_crew(env: pd.DataFrame, cfg: SimConfig) -> list[dict]:
    """One check-in per astronaut per day. Returns a list of dict rows."""
    rng = np.random.default_rng(cfg.seed + 1)
    day0 = (int(env.ts.iloc[0]) // 86400 + 1) * 86400 + CHECKIN_HOUR * 3600
    rows = []
    sens = rng.uniform(0.6, 1.4, len(CREW))
    for a, person in enumerate(CREW):
        base = {"headache": rng.uniform(0.8, 2.0), "vision": rng.uniform(0.4, 1.2),
                "congestion": rng.uniform(1.0, 2.5), "fatigue": rng.uniform(2.0, 3.5),
                "sleep": rng.uniform(6.0, 7.5), "mood": rng.uniform(3.6, 4.4),
                "rt": rng.uniform(255, 300)}
        ar = {k: 0.0 for k in ("headache", "congestion", "fatigue", "sleep")}
        for d in range(cfg.days - 4):
            t = day0 + d * 86400 + int(rng.integers(-900, 900))
            if t > env.ts.iloc[-1]:
                break
            for k in ar:
                ar[k] = 0.3 * ar[k] + rng.normal(0, 0.7)
            expo = _exposure_at(env, t, cfg.lag_hours)
            drive = 0.0
            if cfg.planted and not np.isnan(expo):
                drive = cfg.strength * sens[a] * max(0.0, expo - cfg.knee_mmhg)
            headache = base["headache"] + ar["headache"] + drive
            sleep_q = base["sleep"] + ar["sleep"] - 0.25 * drive
            fatigue = base["fatigue"] + ar["fatigue"] + 0.35 * (6.5 - sleep_q) + 0.2 * drive
            congestion = base["congestion"] + ar["congestion"]
            vision = base["vision"] + rng.normal(0, 0.35)
            mood = base["mood"] - 0.08 * (headache - base["headache"]) + rng.normal(0, 0.35)
            rt = base["rt"] + 4.0 * (fatigue - base["fatigue"]) + rng.normal(0, 9)
            rows.append({
                "person": a, "ts": int(t),
                "headache": float(np.clip(headache, 0, 10)),
                "vision": float(np.clip(vision, 0, 10)),
                "congestion": float(np.clip(congestion, 0, 10)),
                "fatigue": float(np.clip(fatigue, 0, 10)),
                "sleep_quality": float(np.clip(sleep_q + 1.0, 0, 10)),
                "mood": float(np.clip(round(mood), 1, 5)),
                "reaction_ms": float(max(180, rt)),
                "source": "simulated",
            })
    return rows
