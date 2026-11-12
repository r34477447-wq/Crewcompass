import numpy as np
import pandas as pd
import pytest

from crewcompass import baseline, co2, correlation, digest, ingest, service, simulator, validation
from crewcompass import config as C
from crewcompass import db


@pytest.fixture()
def conn(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "DB_PATH", tmp_path / "t.sqlite3")
    with db.connect() as c:
        yield c


# ---- CO2 ----
def test_ppm_conversion_matches_nasa_numbers():
    assert co2.ppm_to_mmhg(1_000_000) == pytest.approx(760)
    assert float(co2.mmhg_to_ppm(2.5)) == pytest.approx(3289, abs=1)
    assert float(co2.mmhg_to_ppm(3.0)) == pytest.approx(3947, abs=1)


def _env(ppm, n=24 * 8 * 2):
    ts = 1_700_000_000 + np.arange(n) * 1800
    return pd.DataFrame({"ts": ts, "co2_mmhg": co2.ppm_to_mmhg(np.full(n, ppm))})


@pytest.mark.parametrize("ppm,status", [(2500, "nominal"), (2800, "watch"),
                                        (3400, "above_guidance"), (4200, "above_limit")])
def test_co2_status(ppm, status):
    assert co2.summarize(_env(ppm))["status"] == status


def test_co2_needs_a_week_of_data():
    assert co2.summarize(_env(3400, n=48 * 2))["status"] == "insufficient"


# ---- baseline ----
def test_baseline_calibrating_with_little_data():
    assert baseline.evaluate_metric([1, 2, 1, 2], "headache")["state"] == "calibrating"


def test_one_bad_day_does_not_alert():
    vals = [1, 1.5, 1, 1.2, 1, 1.4, 1.1, 1, 1.3, 1.2, 1, 1.1, 1, 1.2, 8]
    assert baseline.evaluate_metric(vals, "headache")["state"] == "watch"


def test_persistent_change_alerts():
    vals = [1, 1.5, 1, 1.2, 1, 1.4, 1.1, 1, 1.3, 1.2, 1, 1.1, 6, 7, 7.5, 8]
    assert baseline.evaluate_metric(vals, "headache")["state"] == "persistent"


def test_direction_for_sleep_is_inverted():
    vals = [7, 7.2, 6.8, 7.1, 7, 7.3, 6.9, 7, 7.1, 7, 7.2, 7, 2, 2, 2, 2]
    assert baseline.evaluate_metric(vals, "sleep_quality")["state"] == "persistent"


def test_vision_escalates_faster_and_rolls_up():
    ok = [1, 1.3, 1, 1.2, 1, 1.4, 1.1, 1, 1.3, 1.2, 1, 1.1, 1, 1.2]
    hist = {m: list(ok) for m in C.METRICS}
    hist["vision"] = ok[:-2] + [6, 6.5]
    assert baseline.evaluate_astronaut(hist)["level"] == "escalate"


def test_flat_history_does_not_blow_up():
    vals = [2.0] * 14 + [2.3]
    assert baseline.evaluate_metric(vals, "headache")["state"] == "normal"


# ---- correlation: the planted-signal test is the key validity check ----
def _run(planted, seed):
    cfg = simulator.SimConfig(planted=planted, seed=seed)
    env = simulator.simulate_environment(cfg)
    rows = pd.DataFrame(simulator.simulate_crew(env, cfg))
    return [correlation.analyze(g.ts.to_numpy(), g.headache.to_numpy(), env, seed=1)
            for _, g in rows.groupby("person")]


def test_planted_link_is_found():
    res = [r for s in (1, 2, 3) for r in _run(True, s)]
    hits = [r for r in res if r["p"] < 0.05 and r["env"] == "co2_mmhg"]
    assert len(hits) >= 0.6 * len(res)


def test_no_link_stays_quiet():
    res = [r for s in (1, 2, 3, 4) for r in _run(False, s)]
    assert sum(r["p"] < 0.05 for r in res) <= 2
    assert all(r["confidence"] != "high" for r in res)


def test_confidence_is_capped():
    for r in _run(True, 1):
        assert r["confidence"] in ("none", "low", "medium")


def test_insufficient_data_is_reported():
    env = simulator.simulate_environment(simulator.SimConfig())
    out = correlation.analyze(np.array([env.ts.iloc[200]]), np.array([3.0]), env)
    assert out["status"] == "insufficient"


def test_validation_runner_shape():
    v = validation.run(seeds=2)
    assert v["planted"]["tests"] == 8 and v["none"]["tests"] == 8


# ---- ingest ----
def test_parse_eda_csv_flexible_columns():
    t = pd.date_range("2014-04-01", periods=600, freq="5min", tz="UTC")
    df = pd.DataFrame({"Controller_Time_GMT": t.strftime("%Y-%m-%d %H:%M:%S"),
                       "CO2_ppm": np.full(600, 3000.0), "Temp_C": 22.0})
    env = ingest.parse_eda_csv(df.to_csv(index=False).encode())
    assert env.co2_mmhg.iloc[0] == pytest.approx(2.28, abs=0.01)
    assert env.temp_c.notna().all() and env.humidity_pct.isna().all()
    assert env.ts.iloc[0] == 1396310400          # 2014-04-01 00:00 UTC, in seconds
    assert set(np.diff(env.ts)) == {1800}


def test_parse_eda_csv_reports_columns_on_failure():
    with pytest.raises(ValueError, match="Columns"):
        ingest.parse_eda_csv(b"a,b\n1,2\n3,4\n")


# ---- service + digest ----
def test_seed_status_and_digest(conn):
    service.seed_demo(conn, planted=True)
    crew = service.crew_overview(conn)
    assert len(crew) == 4
    st = service.status(conn, 1)
    assert st["cards"] and "insights" in st
    d = digest.build(conn)
    text, _ = digest.render(conn, "md")
    assert len(text.encode()) < 4000
    assert d["crew"][0]["callsign"] == "Altair"


def test_digest_has_no_raw_data(conn):
    service.seed_demo(conn, planted=False)
    text, _ = digest.render(conn, "json")
    assert "headache" not in text.replace("Possible", "") or '"symptom"' in text
    assert "reaction_ms" not in text


def test_checkin_roundtrip(conn):
    service.seed_demo(conn, planted=False)
    service.add_checkin(conn, 1, dict(headache=2, vision=1, congestion=1, fatigue=3,
                                      sleep_quality=6, mood=4, reaction_ms=280))
    assert service.status(conn, 1)["checkins"] >= 1
    with pytest.raises(KeyError):
        service.add_checkin(conn, 99, {})
