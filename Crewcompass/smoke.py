"""End-to-end smoke test against a running server: python smoke.py [http://127.0.0.1:8000]"""
import json, sys, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"

def call(path, data=None):
    req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r) if "json" in r.headers.get("content-type", "") else r.read().decode()

call("/api/demo/seed", {"scenario": "planted"})
crew = call("/api/crew")["crew"]; assert len(crew) == 4, crew
env = call("/api/environment/summary"); assert env["available"], env
st = call("/api/crew/1/status"); assert st["cards"] and st["insights"], st
assert "CrewCompass health digest" in call("/api/digest?format=md")
v = call("/api/validation?seeds=4"); assert v["planted"]["detection_rate"] >= 0.5, v
print("smoke test passed:", {c["callsign"]: c["level"] for c in crew}, "| detection", v["planted"]["detection_rate"])
