# CrewCompass

An offline-first crew health companion for long space missions. Built for the NASA Space Apps Challenge 2026, "Create Health Monitoring Software for Astronauts on Space Missions".

> Decision support, not a medical device. Serious signs go to the crew medical officer.

CrewCompass does four things on the vehicle, with no network:

1. **Gather**: a 60-second daily CrewCheck (symptom sliders, mood, a 30-second reaction test) and cabin environment series (CO2, temperature, humidity, radiation dose rate).
2. **Evaluate**: each astronaut against their *own* rolling baseline (median and MAD, robust z-score, persistence rule), and the 1-hour and 7-day CO2 averages against NASA's 3 mmHg limit and 2.5 mmHg guidance.
3. **Explain**: a lagged cross-correlation (0 to 72 h) of each symptom against each environment series, with a block-shuffle test. Confidence is capped at "medium" because fluid shift is not measured.
4. **Act**: environment-first action cards from an offline library, and a compact health digest for Earth.

## Quickest way: no install, no server

Open **`dist/crewcompass-standalone.html`** in any browser (double-click it, or open it from a phone or tablet). The whole app, including the analysis, runs inside the page and keeps its data in the browser. It loads a simulated mission on first start.

To rebuild that file after changing the front end: `python tools/build_standalone.py` (no npm needed). The Python server below is the full version with SQLite storage; the browser version uses the same method, ported to JavaScript in `frontend/js/engine/`.

## Run it with the Python server

Requirements: Python 3.11+ and `pip install -r backend/requirements.txt`.

```bash
./run.sh                 # http://127.0.0.1:8000, seeds simulated demo data on first run
./run.sh --port 9000     # another port
```

Open the URL in a browser. On a phone or tablet it can be installed as an app (the page ships a manifest and a service worker that caches the app files).

Tests:

```bash
cd backend && python3 -m pytest -q          # 22 unit tests, including the planted-signal check
python3 smoke.py http://127.0.0.1:8000      # end-to-end against a running server
```

## Layout

```
backend/crewcompass/
  config.py       thresholds and constants (each marked NASA-sourced or PROTOTYPE)
  co2.py          ppm <-> mmHg, 1 h / 24 h / 7 d averages, status
  baseline.py     per-astronaut baseline, robust z, persistence rule, escalation
  correlation.py  lagged cross-correlation + block-shuffle p-value + capped confidence
  actions.py      offline action-card library and card selection
  digest.py       health digest for Earth (JSON and Markdown)
  simulator.py    simulated cabin and crew data, with an optional planted CO2 -> headache link
  validation.py   plant a link / plant none, report detection and false-alarm rates
  ingest.py       parse NASA OSDR EDA CSV exports
  db.py           SQLite storage
  service.py      application logic
  api.py          HTTP layer (Starlette)
frontend/         no-build ES-module app: pages/, ui/, css/, sw.js, manifest
  js/engine/      the same analysis in JavaScript, used by the standalone file
tools/            build_standalone.py (bundles everything into one HTML file)
dist/             crewcompass-standalone.html (ready to open)
docs/METHODS.md   how every number is computed, and what is and is not NASA's
```

## Using real NASA data

On the Environment page, upload a CSV exported from the OSDR Environmental Data Application. The parser looks for a time column (for example `Controller_Time_GMT`) and a CO2 column in ppm, and optionally temperature, humidity and dose rate. CO2 is converted with `mmHg = ppm × 760 / 1,000,000`.

Be clear about what that data is. The EDA tables for Rodent Research missions describe experiment conditions on ISS hardware and matching ground platforms. They are **not** crew-cabin air. CrewCompass uses them as a stand-in for a cabin sensor series and labels the source everywhere. For the cause analysis, the uploaded series should span the check-in history (about 30 days or more); shorter series give an "insufficient data" message rather than a result.

Radiation dose data comes from NASA's Space Radiation Analysis Group (SRAG) via OSDR. SRAG consultation and acknowledgement are required before publishing or presenting results.

## What is simulated

Individual astronaut health records are not public. The crew check-ins in the demo are simulated, always labeled "simulated" in the app, and the simulator can plant a known CO2 -> headache link so the analysis can be validated. The strength of that link is **illustrative**. Calibrate it from the CO2 and headache analysis in NASA's technical brief OCHMO-TB-004 before making any claim about the size of a real effect.

## Known limits

- Watch, alert and persistence thresholds are prototype choices, not NASA values.
- Action cards are examples; real cards must be written and approved by flight surgeons.
- The server is Starlette with plain JavaScript modules. A React front end or FastAPI back end can replace either layer without touching `backend/crewcompass/` analysis code.
- No authentication: it is meant to run on a vehicle's closed network. Add access control before any other use.
