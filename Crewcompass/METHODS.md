# Methods

Every number in CrewCompass, how it is computed, and where it comes from.

## 1. CO2

- Conversion: `mmHg = ppm × 760 / 1,000,000` (1 atm). 2.5 mmHg is about 3,289 ppm; 3 mmHg is about 3,947 ppm.
- Averages: 1 hour, 24 hours and 7 days, ending at the newest sample. A window needs at least 50% of its expected samples, otherwise the app reports "not enough data" instead of a number.
- Status: `above_limit` if the 1-hour mean (or 7-day mean) is at or above 3 mmHg; `above_guidance` if the 7-day mean is at or above 2.5 mmHg; `watch` if it is at or above 2.0 mmHg; else `nominal`.
- Sources: NASA CO2 technical brief OCHMO-TB-004 Rev D; NASA-STD-3001. **The 2.0 mmHg watch margin is ours.** Confirm the 1-hour and 7-day wording against the brief before presenting.
- A 5-minute sample can briefly exceed a limit that is defined on an average, which is why raw readings are averaged before comparison.

## 2. Personal baseline (`baseline.py`)

For each measure (headache, vision, congestion, fatigue, sleep quality, mood, reaction time):

1. Baseline = the up-to-21 check-ins before the most recent 5.
2. Spread = MAD × 1.4826, floored per measure so a flat history cannot divide by about zero.
3. Robust z = (value − median) / spread, signed so that "worse" is positive (higher for symptoms, lower for sleep and mood, higher for reaction time).
4. A "bad day" is z ≥ 2.0.
5. **Persistence rule**: alert when at least 3 of the last 5 days are bad. One bad night gives only a "watch".
6. Vision is stricter: 2 bad days of the last 3 escalates to "contact the crew medical officer".
7. At least 7 baseline points are needed; before that the state is "calibrating".

A crew of four is too small for population thresholds, and individual normals differ, so each person is compared only with themselves. All thresholds here are **prototype choices** to be reviewed by flight surgeons.

## 3. Cause analysis (`correlation.py`)

For each symptom and each check-in at time `t`:

- Exposure to an environment series at lag `L` = mean of the series over the 24 h ending at `t − L`, for `L` in 0, 6, ..., 72 h.
- Statistic = largest absolute Spearman correlation over all four environment series and 13 lags (52 columns).
- p-value: shuffle the symptom series in blocks of 3 days (keeps short-term autocorrelation), 1,000 times, and count how often the shuffled maximum reaches the observed one. Because the maximum over all columns is compared, the search over many series and lags is already accounted for.
- Needs 21 paired days. Otherwise the result is "insufficient".
- Confidence: `none` (p ≥ 0.05), `low` (p < 0.05), `medium` (p < 0.01 and |r| ≥ 0.4). **Never higher**: fluid shift and other drivers are not measured, so a correlation is a possible contributor, not a cause.

## 4. Validation (`validation.py`, `simulator.py`)

Symptoms are simulated. The simulator can plant a CO2 -> headache link at a known 12 h lag (strength illustrative) or plant nothing. Over 10 simulated missions × 4 astronauts:

- With a planted link: the analysis detects it in roughly 85 to 90% of series, names CO2, and gets the lag within 12 h.
- With no link: about 3 to 4% false alarms (5% expected by chance at p < 0.05).

The exact figures differ a little between runs and between the Python and browser versions, because each uses its own random generator. Quote the numbers the Validation page shows.

These rates show that the **method** works. They say nothing about the strength of a real CO2 effect. Next step: calibrate the simulator from OCHMO-TB-004 and re-run.

## 5. Digest (`digest.py`)

Crew level and reason, the strongest cause finding with its confidence, up to three action titles, and the CO2 summary. Callsigns only; no raw check-in answers. Typically about 1 to 2 KB.

## 6. NASA requirements mapping

The mapping on the About page (NASA-STD-3001 [V2 6001], [V2 6020-6022], [V2 6107], [V1 3003], [V1 3004]) is our reading of the standard. Confirm wording against the current release.
