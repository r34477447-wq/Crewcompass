"""Constants and thresholds for CrewCompass.

Anything that comes from a NASA document is marked with its source so it can be
re-checked. Anything marked PROTOTYPE is our own choice and must be reviewed by
flight surgeons before any real use.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("CREWCOMPASS_DB", ROOT / "data" / "crewcompass.sqlite3"))
FRONTEND_DIR = Path(os.environ.get("CREWCOMPASS_FRONTEND", ROOT / "frontend"))

# --- CO2 (source: NASA CO2 technical brief OCHMO-TB-004 Rev D; NASA-STD-3001) ---
ATM_MMHG = 760.0
MMHG_PER_PPM = ATM_MMHG / 1_000_000  # mmHg = ppm * 760 / 1,000,000 (1 atm)
CO2_GUIDANCE_7D_MMHG = 2.5   # 7-day average guidance
CO2_LIMIT_MMHG = 3.0         # limit used for the 1-hour average check
CO2_WATCH_MMHG = 2.0         # PROTOTYPE: early-warning margin, our own choice

# --- Baseline and persistence (PROTOTYPE choices, documented in docs/METHODS.md) ---
BASELINE_MIN_POINTS = 7       # check-ins needed before a baseline is trusted
BASELINE_MAX_POINTS = 21      # rolling baseline length
RECENT_DAYS = 5               # days judged against the baseline
Z_FLAG = 2.0                  # robust z-score that counts as a "bad day"
PERSIST_DAYS = 3              # bad days (of RECENT_DAYS) needed to alert
VISION_PERSIST = (2, 3)       # vision: 2 bad days out of the last 3 escalates
MAD_SCALE = 1.4826            # makes MAD comparable to a standard deviation
MIN_SCALE = {                 # floor for the spread, so a flat history cannot divide by ~0
    "headache": 0.6, "vision": 0.6, "congestion": 0.6, "fatigue": 0.6,
    "sleep_quality": 0.6, "mood": 0.4, "reaction_ms": 12.0,
}

# direction in which each metric gets worse (+1 = higher is worse)
WORSE_DIRECTION = {
    "headache": 1, "vision": 1, "congestion": 1, "fatigue": 1,
    "sleep_quality": -1, "mood": -1, "reaction_ms": 1,
}
METRICS = list(WORSE_DIRECTION)
SYMPTOMS = ["headache", "vision", "congestion", "fatigue"]
ENV_SERIES = ["co2_mmhg", "temp_c", "humidity_pct", "dose_rate_usv_h"]
ENV_LABELS = {
    "co2_mmhg": "Cabin CO2", "temp_c": "Temperature",
    "humidity_pct": "Humidity", "dose_rate_usv_h": "Radiation dose rate",
}

# --- Lagged analysis ---
LAGS_HOURS = list(range(0, 73, 6))   # 0-72 h
EXPOSURE_WINDOW_H = 24               # exposure = mean over the 24 h ending at (check-in - lag)
MIN_PAIRED_DAYS = 21
SHUFFLE_ROUNDS = 1000
SHUFFLE_BLOCK = 3                    # days per block, keeps short-term autocorrelation
P_LOW = 0.05
P_MEDIUM = 0.01
R_MEDIUM = 0.40
# Confidence is deliberately capped at "medium": fluid shift and other drivers are not measured.
CONFIDENCE_CAP = "medium"

DISCLAIMER = (
    "Decision support, not a medical device. Serious signs go to the crew medical "
    "officer. Action cards in this prototype are examples to be authored and approved "
    "by flight surgeons."
)
