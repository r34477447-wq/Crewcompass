// Lagged cross-correlation with a block-shuffle test. Mirrors backend/crewcompass/correlation.py.
import * as C from "./config.js";
import { makeRng } from "./rng.js";

function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; } // first index with arr[i] > x

function exposure(t, v, cs, checkinTs, lagH, step) {
  const expected = Math.max(1, (C.WINDOW_H * 3600) / step);
  return checkinTs.map((c) => {
    const end = c - lagH * 3600, start = end - C.WINDOW_H * 3600;
    const i1 = lowerBound(t, end), i0 = lowerBound(t, start), cnt = i1 - i0;
    return cnt < 0.5 * expected || cnt <= 0 ? NaN : (cs[i1] - cs[i0]) / cnt;
  });
}

function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
}
function standardize(a) {
  const n = a.length, mean = a.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return sd === 0 ? null : a.map((x) => (x - mean) / sd);
}
function confidence(p, r) { return p < C.P_MEDIUM && Math.abs(r) >= C.R_MEDIUM ? "medium" : p < C.P_LOW ? "low" : "none"; } // capped at medium on purpose

/** env: columns {ts, co2_mmhg, ...}; returns the strongest lagged link for one symptom series. */
export function analyze(checkinTs, symptom, env, seed = 0, rounds = C.ROUNDS) {
  const cols = [], meta = [];
  for (const name of C.ENV_SERIES) {
    if (!env[name]) continue;
    const t = [], v = [];
    env.ts.forEach((ts, i) => { if (env[name][i] != null && !Number.isNaN(env[name][i])) { t.push(ts); v.push(env[name][i]); } });
    if (t.length < 24) continue;
    const cs = [0]; v.forEach((x) => cs.push(cs[cs.length - 1] + x));
    const step = (t[t.length - 1] - t[0]) / (t.length - 1);
    for (const lag of C.LAGS) { cols.push(exposure(t, v, cs, checkinTs, lag, step)); meta.push([name, lag]); }
  }
  if (!cols.length) return { status: "insufficient", message: "No environment series available.", n: 0 };
  const ok = checkinTs.map((_, i) => !Number.isNaN(symptom[i]) && cols.every((c) => !Number.isNaN(c[i])));
  const keep = ok.map((o, i) => (o ? i : -1)).filter((i) => i >= 0), n = keep.length;
  if (n < C.MIN_PAIRED) return { status: "insufficient", n, message: `Need ${C.MIN_PAIRED} paired days, have ${n}.` };
  const y = keep.map((i) => symptom[i]);
  if (Math.max(...y) === Math.min(...y)) return { status: "insufficient", n, message: "Symptom did not vary." };

  const yr = standardize(ranks(y)), X = [], m2 = [];
  cols.forEach((c, k) => { const s = standardize(ranks(keep.map((i) => c[i]))); if (s) { X.push(s); m2.push(meta[k]); } });
  if (!X.length) return { status: "insufficient", n, message: "Environment did not vary." };

  const dot = (col, yy) => { let s = 0; for (let i = 0; i < n; i++) s += col[i] * yy[i]; return s / n; };
  const rObs = X.map((c) => dot(c, yr));
  let best = 0; rObs.forEach((r, i) => { if (Math.abs(r) > Math.abs(rObs[best])) best = i; });
  const stat = Math.abs(rObs[best]);

  const rng = makeRng(seed + 12345), blocks = [];
  for (let i = 0; i < n; i += C.BLOCK) blocks.push(Array.from({ length: Math.min(C.BLOCK, n - i) }, (_, k) => i + k));
  let ge = 0; const yp = new Float64Array(n);
  for (let r = 0; r < rounds; r++) {
    const order = rng.shuffle(blocks.map((_, i) => i)); let k = 0;
    for (const b of order) for (const idx of blocks[b]) yp[k++] = yr[idx];
    let mx = 0; for (const c of X) { const a = Math.abs(dot(c, yp)); if (a > mx) mx = a; }
    if (mx >= stat) ge++;
  }
  const p = (1 + ge) / (1 + rounds), [envName, lag] = m2[best], rr = rObs[best], profile = {};
  m2.forEach(([name, lg], i) => (profile[name] = profile[name] || []).push({ lag_h: lg, r: Math.round(rObs[i] * 1000) / 1000 }));
  return { status: "ok", n, env: envName, env_label: C.ENV_LABELS[envName], lag_h: lag, r: Math.round(rr * 1000) / 1000, p: Math.round(p * 10000) / 10000,
    confidence: confidence(p, rr), confidence_cap: "medium", direction: rr > 0 ? "higher" : "lower", profile, rounds };
}
