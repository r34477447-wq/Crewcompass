// Constants and thresholds. Mirrors backend/crewcompass/config.py (NASA-sourced values vs PROTOTYPE choices).
export const MMHG_PER_PPM = 760 / 1e6;
export const CO2_GUIDANCE_7D = 2.5;   // NASA 7-day guidance (OCHMO-TB-004)
export const CO2_LIMIT = 3.0;         // NASA limit, checked on the 1-hour average
export const CO2_WATCH = 2.0;         // PROTOTYPE margin
export const BASELINE_MIN = 7;
export const BASELINE_MAX = 21;
export const RECENT_DAYS = 5;
export const Z_FLAG = 2.0;
export const PERSIST_DAYS = 3;
export const VISION_PERSIST = [2, 3];
export const MAD_SCALE = 1.4826;
export const MIN_SCALE = { headache: 0.6, vision: 0.6, congestion: 0.6, fatigue: 0.6, sleep_quality: 0.6, mood: 0.4, reaction_ms: 12 };
export const WORSE = { headache: 1, vision: 1, congestion: 1, fatigue: 1, sleep_quality: -1, mood: -1, reaction_ms: 1 };
export const METRICS = Object.keys(WORSE);
export const SYMPTOMS = ["headache", "vision", "congestion", "fatigue"];
export const ENV_SERIES = ["co2_mmhg", "temp_c", "humidity_pct", "dose_rate_usv_h"];
export const ENV_LABELS = { co2_mmhg: "Cabin CO2", temp_c: "Temperature", humidity_pct: "Humidity", dose_rate_usv_h: "Radiation dose rate" };
export const LAGS = Array.from({ length: 13 }, (_, i) => i * 6);
export const WINDOW_H = 24;
export const MIN_PAIRED = 21;
export const ROUNDS = 1000;
export const BLOCK = 3;
export const P_LOW = 0.05;
export const P_MEDIUM = 0.01;
export const R_MEDIUM = 0.4;
export const DISCLAIMER = "Decision support, not a medical device. Serious signs go to the crew medical officer. Action cards in this prototype are examples to be authored and approved by flight surgeons.";
