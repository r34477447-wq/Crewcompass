// Simulated cabin and crew data (always labelled "simulated"). Can plant a known CO2 -> headache link.
// Link strength is illustrative; calibrate from NASA OCHMO-TB-004 before any claim.
import * as C from "./config.js";
import { makeRng } from "./rng.js";

export const CREW = [{ callsign: "Altair", role: "Commander" }, { callsign: "Vega", role: "Flight Engineer" }, { callsign: "Lyra", role: "Science Officer" }, { callsign: "Orion", role: "Medical Officer" }];
const STEP = 1800;
export const defaults = { days: 60, seed: 7, planted: true, lag_hours: 12, strength: 6.0, knee: 2.15, start_ts: 1_760_000_000 };
const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function simulateEnvironment(cfg) {
  const rng = makeRng(cfg.seed), n = Math.floor((cfg.days * 24 * 3600) / STEP);
  const ts = [], co2 = [], temp = [], hum = [], dose = [];
  const ar = new Array(n).fill(0);
  for (let i = 1; i < n; i++) ar[i] = 0.97 * ar[i - 1] + rng.normal(0, 38);
  const ppm = ar.map((a, i) => { const h = (i * STEP) / 3600; return 2900 + 230 * Math.sin((2 * Math.PI * (h - 6)) / 24) + a; });
  for (let e = 0; e < Math.max(3, Math.floor(cfg.days / 5)); e++) {
    const start = rng.int(48, Math.max(60, n - 90)), length = rng.int(10, 36), bump = rng.uniform(700, 1300), len = Math.min(length, n - start), M = len + 2;
    for (let k = 0; k < len; k++) ppm[start + k] += bump * (0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 1)) / (M - 1)));
  }
  let walk = 0;
  for (let i = 0; i < n; i++) {
    const h = (i * STEP) / 3600; walk += rng.normal(0, 0.01);
    ts.push(cfg.start_ts + i * STEP); co2.push(ppm[i] * C.MMHG_PER_PPM);
    temp.push(22.4 + 0.5 * Math.sin((2 * Math.PI * h) / 24) + walk * 0.2);
    hum.push(44 + 3 * Math.sin((2 * Math.PI * (h - 3)) / 24) + rng.normal(0, 0.8));
    dose.push(Math.max(8, 22 + (Math.sin((2 * Math.PI * h) / 1.55) > 0.8 ? 6 : 0) + rng.normal(0, 1.2)));
  }
  return { ts, co2_mmhg: co2, temp_c: temp, humidity_pct: hum, dose_rate_usv_h: dose, source: "simulated" };
}

function exposureAt(env, t, lagH) {
  const end = t - lagH * 3600, start = end - C.WINDOW_H * 3600; let s = 0, n = 0;
  for (let i = 0; i < env.ts.length; i++) if (env.ts[i] > start && env.ts[i] <= end) { s += env.co2_mmhg[i]; n++; }
  return n ? s / n : NaN;
}

export function simulateCrew(env, cfg) {
  const rng = makeRng(cfg.seed + 1), rows = [];
  const day0 = (Math.floor(env.ts[0] / 86400) + 1) * 86400 + 8 * 3600, last = env.ts[env.ts.length - 1];
  const sens = CREW.map(() => rng.uniform(0.6, 1.4));
  CREW.forEach((_, a) => {
    const base = { headache: rng.uniform(0.8, 2.0), vision: rng.uniform(0.4, 1.2), congestion: rng.uniform(1.0, 2.5), fatigue: rng.uniform(2.0, 3.5), sleep: rng.uniform(6.0, 7.5), mood: rng.uniform(3.6, 4.4), rt: rng.uniform(255, 300) };
    const ar = { headache: 0, congestion: 0, fatigue: 0, sleep: 0 };
    for (let d = 0; d < cfg.days - 4; d++) {
      const t = day0 + d * 86400 + rng.int(-900, 900);
      if (t > last) break;
      for (const k of Object.keys(ar)) ar[k] = 0.3 * ar[k] + rng.normal(0, 0.7);
      const expo = exposureAt(env, t, cfg.lag_hours);
      const drive = cfg.planted && !Number.isNaN(expo) ? cfg.strength * sens[a] * Math.max(0, expo - cfg.knee) : 0;
      const headache = base.headache + ar.headache + drive;
      const sleepQ = base.sleep + ar.sleep - 0.25 * drive;
      const fatigue = base.fatigue + ar.fatigue + 0.35 * (6.5 - sleepQ) + 0.2 * drive;
      const vision = base.vision + rng.normal(0, 0.35);
      const mood = base.mood - 0.08 * (headache - base.headache) + rng.normal(0, 0.35);
      const rt = base.rt + 4 * (fatigue - base.fatigue) + rng.normal(0, 9);
      rows.push({ person: a, ts: t, headache: clip(headache, 0, 10), vision: clip(vision, 0, 10), congestion: clip(base.congestion + ar.congestion, 0, 10),
        fatigue: clip(fatigue, 0, 10), sleep_quality: clip(sleepQ + 1, 0, 10), mood: clip(Math.round(mood), 1, 5), reaction_ms: Math.max(180, rt), source: "simulated" });
    }
  });
  return rows;
}
