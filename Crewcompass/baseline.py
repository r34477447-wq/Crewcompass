"""Per-astronaut rolling baseline: median and MAD, robust z-score, persistence rule.

Each astronaut is compared only with their own recent history. A crew of four is
too small for population thresholds, and individual normals differ widely.
"""
from __future__ import annotations

import numpy as np

from . import config as C


def robust_z(value: float, history: np.ndarray, metric: str) -> tuple[float, float, float]:
    """Return (z, median, spread) of `value` against `history`."""
    med = float(np.median(history))
    mad = float(np.median(np.abs(history - med))) * C.MAD_SCALE
    spread = max(mad, C.MIN_SCALE[metric])
    return (value - med) / spread, med, spread


def evaluate_metric(values: list[float], metric: str) -> dict:
    """Evaluate one metric. `values` is oldest -> newest, one per check-in."""
    v = np.asarray(values, dtype=float)
    n = len(v)
    recent_n = min(C.RECENT_DAYS, n)
    base = v[: n - recent_n][-C.BASELINE_MAX_POINTS:]
    out = {"metric": metric, "latest": float(v[-1]) if n else None, "n": n}
    if len(base) < C.BASELINE_MIN_POINTS:
        out.update(state="calibrating", z=None, baseline=None, bad_days=0,
                   needed=C.BASELINE_MIN_POINTS + C.RECENT_DAYS - n)
        return out

    sign = C.WORSE_DIRECTION[metric]
    recent = v[-recent_n:]
    zs = []
    for x in recent:
        z, med, spread = robust_z(float(x), base, metric)
        zs.append(sign * z)
    zs = np.asarray(zs)
    bad = zs >= C.Z_FLAG
    bad_days = int(bad.sum())

    if metric == "vision":
        need, window = C.VISION_PERSIST
        persistent = int(bad[-window:].sum()) >= need
    else:
        persistent = bad_days >= C.PERSIST_DAYS
    watch = bool(bad[-1]) and not persistent

    state = "persistent" if persistent else "watch" if watch else "normal"
    _, med, spread = robust_z(float(v[-1]), base, metric)
    out.update(state=state, z=round(float(zs[-1]), 2), baseline=round(med, 2),
               spread=round(spread, 2), bad_days=bad_days,
               recent_z=[round(float(z), 2) for z in zs])
    return out


def evaluate_astronaut(history: dict[str, list[float]]) -> dict:
    """Evaluate all metrics and roll them up into one status for the astronaut."""
    metrics = {m: evaluate_metric(history[m], m) for m in C.METRICS if history.get(m)}
    states = [m["state"] for m in metrics.values()]
    persistent = [k for k, m in metrics.items() if m["state"] == "persistent"]
    watching = [k for k, m in metrics.items() if m["state"] == "watch"]

    if not metrics or all(s == "calibrating" for s in states):
        level, reason = "calibrating", "Building a personal baseline."
    elif "vision" in persistent:
        level, reason = "escalate", "Persistent vision change: contact the crew medical officer."
    elif len(persistent) >= 3:
        level, reason = "escalate", "Several measures are persistently off baseline."
    elif persistent:
        level, reason = "alert", "Persistent change from baseline: " + ", ".join(persistent) + "."
    elif watching:
        level, reason = "watch", "Today differs from baseline: " + ", ".join(watching) + "."
    else:
        level, reason = "normal", "Within the astronaut's own baseline."
    return {"level": level, "reason": reason, "persistent": persistent,
            "watching": watching, "metrics": metrics}
