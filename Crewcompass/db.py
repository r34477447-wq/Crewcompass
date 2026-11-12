"""SQLite storage. One small file on the vehicle; no server, no network."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager

import pandas as pd

from . import config as C

SCHEMA = """
CREATE TABLE IF NOT EXISTS astronauts (
  id INTEGER PRIMARY KEY, callsign TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY,
  astronaut_id INTEGER NOT NULL REFERENCES astronauts(id),
  ts INTEGER NOT NULL,
  headache REAL, vision REAL, congestion REAL, fatigue REAL,
  sleep_quality REAL, mood REAL, reaction_ms REAL,
  source TEXT NOT NULL DEFAULT 'crew'
);
CREATE INDEX IF NOT EXISTS ix_checkins ON checkins(astronaut_id, ts);
CREATE TABLE IF NOT EXISTS environment (
  ts INTEGER PRIMARY KEY,
  co2_mmhg REAL, temp_c REAL, humidity_pct REAL, dose_rate_usv_h REAL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


@contextmanager
def connect():
    C.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(C.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_meta(conn, key, default=None):
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_meta(conn, key, value):
    conn.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (key, str(value)))


def reset(conn):
    for t in ("checkins", "environment", "astronauts", "meta"):
        conn.execute(f"DELETE FROM {t}")


def env_frame(conn) -> pd.DataFrame:
    return pd.read_sql_query("SELECT * FROM environment ORDER BY ts", conn)


def insert_env(conn, env: pd.DataFrame, source: str):
    rows = [(int(r.ts), _n(r.co2_mmhg), _n(getattr(r, "temp_c", None)),
             _n(getattr(r, "humidity_pct", None)), _n(getattr(r, "dose_rate_usv_h", None)), source)
            for r in env.itertuples()]
    conn.executemany("INSERT OR REPLACE INTO environment VALUES (?,?,?,?,?,?)", rows)


def _n(v):
    return None if v is None or pd.isna(v) else float(v)


def checkins_frame(conn, astronaut_id: int) -> pd.DataFrame:
    return pd.read_sql_query(
        "SELECT * FROM checkins WHERE astronaut_id=? ORDER BY ts", conn, params=(astronaut_id,))


def data_version(conn) -> str:
    """Cheap fingerprint used to cache expensive analysis."""
    a = conn.execute("SELECT COUNT(*), COALESCE(MAX(ts),0) FROM checkins").fetchone()
    b = conn.execute("SELECT COUNT(*), COALESCE(MAX(ts),0) FROM environment").fetchone()
    return f"{a[0]}:{a[1]}:{b[0]}:{b[1]}"
