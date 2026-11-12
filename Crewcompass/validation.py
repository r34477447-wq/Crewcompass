"""Planted-signal validation.

Plant a known CO2 -> headache link and check that the analysis finds it, at roughly the
right lag. Plant nothing and check that it stays quiet. Runs in memory.
"""
from __future__ import annotations

import pandas as pd

from . import correlation, simulator


def run(seeds: int = 10) -> dict:
    out = {}
    for planted in (True, False):
        found = false_alarm = right_series = right_lag = total = 0
        for seed in range(1, seeds + 1):
            cfg = simulator.SimConfig(planted=planted, seed=seed)
            env = simulator.simulate_environment(cfg)
            rows = pd.DataFrame(simulator.simulate_crew(env, cfg))
            for p in rows.person.unique():
                r = rows[rows.person == p]
                res = correlation.analyze(r.ts.to_numpy(), r.headache.to_numpy(), env, seed=1)
                total += 1
                sig = res.get("status") == "ok" and res["p"] < 0.05
                if not sig:
                    continue
                if planted:
                    found += 1
                    if res["env"] == "co2_mmhg":
                        right_series += 1
                        if abs(res["lag_h"] - cfg.lag_hours) <= 12:
                            right_lag += 1
                else:
                    false_alarm += 1
        key = "planted" if planted else "none"
        out[key] = ({"tests": total, "detected": found, "detection_rate": round(found / total, 3),
                     "co2_identified": right_series, "lag_within_12h": right_lag}
                    if planted else
                    {"tests": total, "false_alarms": false_alarm,
                     "false_alarm_rate": round(false_alarm / total, 3)})
    out["seeds"] = seeds
    out["design"] = {"true_lag_h": 12, "symptom": "headache", "alpha": 0.05,
                     "note": "Symptoms are simulated; link strength is illustrative."}
    return out
