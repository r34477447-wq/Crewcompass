"""Application logic: ties storage, analysis, actions and the digest together."""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from . import actions, baseline, co2, db, ingest, simulator
from . import config as C
from . import correlation

_CACHE: dict[tuple, dict] = {}


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    return df.astype(object).where(df.notna(), None)


# ---------- crew ----------
def list_crew(conn) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM astronauts ORDER BY id")]


def add_checkin(conn, astronaut_id: int, data: dict, ts: int | None = None) -> dict:
    if not conn.execute("SELECT 1 FROM astronauts WHERE id=?", (astronaut_id,)).fetchone():
        raise KeyError("unknown astronaut")
    if ts is None:
        ts = mission_now(conn) or int(time.time())
    cur = conn.execute(
        "INSERT INTO checkins(astronaut_id, ts, headache, vision, congestion, fatigue,"
        " sleep_quality, mood, reaction_ms, source) VALUES (?,?,?,?,?,?,?,?,?,'crew')",
        (astronaut_id, ts, data["headache"], data["vision"], data["congestion"], data["fatigue"],
         data["sleep_quality"], data["mood"], data["reaction_ms"]))
    return {"id": cur.lastrowid, "ts": ts}


def mission_now(conn) -> int | None:
    """The mission clock is the newest timestamp we hold (so replayed data still works)."""
    row = conn.execute("SELECT MAX(m) FROM (SELECT MAX(ts) m FROM checkins UNION ALL "
                       "SELECT MAX(ts) FROM environment)").fetchone()
    return row[0]


def history(conn, astronaut_id: int, days: int = 60) -> list[dict]:
    df = db.checkins_frame(conn, astronaut_id).tail(days)
    return _clean(df).to_dict("records")


# ---------- analysis ----------
def insights(conn, astronaut_id: int) -> list[dict]:
    key = (astronaut_id, db.data_version(conn))
    if key in _CACHE:
        return _CACHE[key]
    ck = db.checkins_frame(conn, astronaut_id)
    env = db.env_frame(conn)
    out = []
    if len(ck) and len(env):
        for i, sym in enumerate(C.SYMPTOMS):
            res = correlation.analyze(ck.ts.to_numpy(), ck[sym].to_numpy(), env, seed=100 + i)
            res["symptom"] = sym
            out.append(res)
    if len(_CACHE) > 64:
        _CACHE.clear()
    _CACHE[key] = out
    return out


def status(conn, astronaut_id: int) -> dict:
    ck = db.checkins_frame(conn, astronaut_id)
    hist = {m: ck[m].dropna().tolist() for m in C.METRICS} if len(ck) else {}
    st = baseline.evaluate_astronaut(hist)
    ins = insights(conn, astronaut_id)
    # only keep the strongest findings, one per symptom, and only for symptoms that are off baseline
    st["insights"] = ins
    st["cards"] = actions.recommend(st, ins)
    st["last_checkin"] = int(ck.ts.iloc[-1]) if len(ck) else None
    st["checkins"] = int(len(ck))
    return st


def crew_overview(conn) -> list[dict]:
    out = []
    for a in list_crew(conn):
        st = status(conn, a["id"])
        out.append({**a, "level": st["level"], "reason": st["reason"],
                    "checkins": st["checkins"], "last_checkin": st["last_checkin"],
                    "persistent": st["persistent"], "watching": st["watching"]})
    return out


# ---------- environment ----------
def env_summary(conn) -> dict:
    env = db.env_frame(conn)
    s = co2.summarize(env) if len(env) else {"available": False, "status": "no_data",
                                             "message": "No environment data yet."}
    if len(env):
        s["source"] = env.source.iloc[-1]
        s["samples"] = int(len(env))
    return s


def env_series(conn, hours: int = 24 * 14, step: int = 1) -> dict:
    env = db.env_frame(conn)
    if env.empty:
        return {"points": []}
    env = env[env.ts > env.ts.iloc[-1] - hours * 3600]
    if step > 1:
        env = env.iloc[::step]
    env = env.assign(co2_ppm=co2.mmhg_to_ppm(env.co2_mmhg).round(0))
    return {"points": _clean(env.drop(columns=["source"]).round(3)).to_dict("records"),
            "source": env.source.iloc[-1] if len(env) else None}


def ingest_eda(conn, raw: bytes, rebase_to_mission: bool = True) -> dict:
    env = ingest.parse_eda_csv(raw)
    row = conn.execute("SELECT MIN(ts) FROM checkins").fetchone()
    note = "as recorded"
    if rebase_to_mission and row and row[0]:
        env = ingest.rebase(env, int(row[0]) - 4 * 86400)
        note = "replayed on the mission clock"
    conn.execute("DELETE FROM environment")
    db.insert_env(conn, env, "nasa-osdr-eda")
    return {"rows": int(len(env)), "mean_co2_mmhg": round(float(env.co2_mmhg.mean()), 3),
            "time_basis": note, "series": [c for c in C.ENV_SERIES if env[c].notna().any()]}


# ---------- demo ----------
def seed_demo(conn, planted: bool = True, days: int = 60, seed: int = 7) -> dict:
    cfg = simulator.SimConfig(days=days, seed=seed, planted=planted)
    env = simulator.simulate_environment(cfg)
    rows = simulator.simulate_crew(env, cfg)
    db.reset(conn)
    for i, p in enumerate(simulator.CREW, start=1):
        conn.execute("INSERT INTO astronauts(id, callsign, role) VALUES (?,?,?)", (i, p["callsign"], p["role"]))
    db.insert_env(conn, env, "simulated")
    conn.executemany(
        "INSERT INTO checkins(astronaut_id, ts, headache, vision, congestion, fatigue,"
        " sleep_quality, mood, reaction_ms, source) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(r["person"] + 1, r["ts"], r["headache"], r["vision"], r["congestion"], r["fatigue"],
          r["sleep_quality"], r["mood"], r["reaction_ms"], "simulated") for r in rows])
    db.set_meta(conn, "scenario", "planted" if planted else "none")
    db.set_meta(conn, "lag_hours", cfg.lag_hours)
    _CACHE.clear()
    return {"astronauts": len(simulator.CREW), "checkins": len(rows), "env_rows": int(len(env)),
            "scenario": "planted" if planted else "none", "labeled": "simulated"}
