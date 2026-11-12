"""Offline health digest for Earth.

A compact, human-readable summary a crew can downlink on a slow link. It carries
no raw data and uses callsigns only. Typical size is under 2 KB.
"""
from __future__ import annotations

import datetime as dt
import json

from . import config as C
from . import db, service

LEVEL_TEXT = {"normal": "Normal", "watch": "Watch", "alert": "Alert",
              "escalate": "Escalate", "calibrating": "Calibrating"}


def _utc(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d %H:%MZ") if ts else "n/a"


def build(conn) -> dict:
    now = service.mission_now(conn)
    env = service.env_summary(conn)
    crew = []
    for a in service.list_crew(conn):
        st = service.status(conn, a["id"])
        finding = None
        for ins in st["insights"]:
            if ins.get("status") == "ok" and ins["confidence"] != "none":
                if finding is None or ins["p"] < finding["p"]:
                    finding = {"symptom": ins["symptom"], "contributor": ins["env_label"],
                               "lag_h": ins["lag_h"], "confidence": ins["confidence"], "p": ins["p"]}
        crew.append({"callsign": a["callsign"], "level": st["level"], "reason": st["reason"],
                     "persistent": st["persistent"], "finding": finding,
                     "actions": [c["title"] for c in st["cards"]][:3]})
    return {
        "generated": _utc(now), "mission_clock_ts": now,
        "scenario": db.get_meta(conn, "scenario", "live"),
        "co2": {k: env.get(k) for k in ("status", "mean_1h_mmhg", "mean_24h_mmhg", "mean_7d_mmhg")},
        "crew": crew, "disclaimer": C.DISCLAIMER,
    }


def to_markdown(d: dict) -> str:
    lines = [f"# CrewCompass health digest · {d['generated']}", ""]
    co = d["co2"]
    lines += [f"**Cabin CO2**: {co['status'].replace('_', ' ')} · 1 h {co['mean_1h_mmhg']} · "
              f"24 h {co['mean_24h_mmhg']} · 7 d {co['mean_7d_mmhg']} mmHg", "", "## Crew", ""]
    for c in d["crew"]:
        lines.append(f"- **{c['callsign']}**: {LEVEL_TEXT[c['level']]}. {c['reason']}")
        if c["finding"]:
            f = c["finding"]
            lines.append(f"  - Possible contributor to {f['symptom']}: {f['contributor']} "
                         f"(about {f['lag_h']} h earlier), confidence {f['confidence']}.")
        if c["actions"]:
            lines.append("  - Suggested: " + "; ".join(c["actions"]))
    lines += ["", f"_{d['disclaimer']}_"]
    return "\n".join(lines)


def render(conn, fmt: str = "json") -> tuple[str, str]:
    d = build(conn)
    if fmt == "md":
        text = to_markdown(d)
        return text, "text/markdown; charset=utf-8"
    return json.dumps(d, indent=2), "application/json"
