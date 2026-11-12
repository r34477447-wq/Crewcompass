// Application logic: mirrors backend/crewcompass/service.py and digest.py.
import * as C from "./config.js";
import { db, save, reset, version } from "./store.js";
import * as baseline from "./baseline.js";
import * as co2 from "./co2.js";
import { analyze } from "./correlation.js";
import { recommend } from "./actions.js";
import * as sim from "./simulator.js";
import { parseEdaCsv, rebase } from "./ingest.js";

const cache = new Map();

export const listCrew = () => db().astronauts.map((a) => ({ ...a }));
export function missionNow() {
  const s = db(), c = s.checkins.length ? Math.max(...s.checkins.map((x) => x.ts)) : null, e = s.env.ts.length ? s.env.ts[s.env.ts.length - 1] : null;
  return c == null && e == null ? null : Math.max(c ?? 0, e ?? 0);
}
const checkinsOf = (id) => db().checkins.filter((c) => c.astronaut_id === id).sort((a, b) => a.ts - b.ts);

export function addCheckin(id, data) {
  const s = db();
  if (!s.astronauts.some((a) => a.id === id)) throw Object.assign(new Error("unknown astronaut"), { status: 404 });
  const ranges = { headache: [0, 10], vision: [0, 10], congestion: [0, 10], fatigue: [0, 10], sleep_quality: [0, 10], mood: [1, 5], reaction_ms: [100, 3000] };
  for (const [k, [lo, hi]] of Object.entries(ranges)) if (typeof data[k] !== "number" || !(data[k] >= lo && data[k] <= hi)) throw Object.assign(new Error(`invalid check-in: ${k}`), { status: 422 });
  const ts = data.ts ?? missionNow() ?? Math.floor(Date.now() / 1000);
  s.checkins.push({ id: s.nextId++, astronaut_id: id, ts, ...Object.fromEntries(Object.keys(ranges).map((k) => [k, data[k]])), source: "crew" });
  cache.clear(); save();
  return { id: s.nextId - 1, ts };
}

export function history(id, days = 60) { return checkinsOf(id).slice(-days); }

export function insights(id) {
  const key = id + "|" + version(); if (cache.has(key)) return cache.get(key);
  const ck = checkinsOf(id), env = db().env, out = [];
  if (ck.length && env.ts.length) for (let i = 0; i < C.SYMPTOMS.length; i++) {
    const sym = C.SYMPTOMS[i];
    const res = analyze(ck.map((c) => c.ts), ck.map((c) => c[sym]), env, 100 + i); res.symptom = sym; out.push(res);
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, out); return out;
}

export function status(id) {
  const ck = checkinsOf(id), hist = {}; for (const m of C.METRICS) hist[m] = ck.map((c) => c[m]).filter((v) => v != null);
  const st = baseline.evaluateAstronaut(hist), ins = insights(id);
  return { ...st, insights: ins, cards: recommend(st, ins), last_checkin: ck.length ? ck[ck.length - 1].ts : null, checkins: ck.length };
}
export function crewOverview() {
  return listCrew().map((a) => { const st = status(a.id); return { ...a, level: st.level, reason: st.reason, checkins: st.checkins, last_checkin: st.last_checkin, persistent: st.persistent, watching: st.watching }; });
}

export function envSummary() {
  const env = db().env, s = env.ts.length ? co2.summarize(env) : { available: false, status: "no_data", message: "No environment data yet." };
  if (env.ts.length) { s.source = env.source; s.samples = env.ts.length; }
  return s;
}
export function envSeries(hours = 336, step = 1) {
  const e = db().env; if (!e.ts.length) return { points: [] };
  const cutoff = e.ts[e.ts.length - 1] - hours * 3600, points = [];
  for (let i = 0; i < e.ts.length; i += step) if (e.ts[i] > cutoff) {
    const r = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
    points.push({ ts: e.ts[i], co2_mmhg: r(e.co2_mmhg[i]), temp_c: r(e.temp_c[i]), humidity_pct: r(e.humidity_pct[i]), dose_rate_usv_h: r(e.dose_rate_usv_h[i]), co2_ppm: Math.round(co2.mmhgToPpm(e.co2_mmhg[i])) });
  }
  return { points, source: e.source };
}
export function ingestEda(text, rebaseToMission = true) {
  let env = parseEdaCsv(text); const s = db(); let note = "as recorded";
  if (rebaseToMission && s.checkins.length) { env = rebase(env, Math.min(...s.checkins.map((c) => c.ts)) - 4 * 86400); note = "replayed on the mission clock"; }
  s.env = { ts: env.ts, co2_mmhg: env.co2_mmhg, temp_c: env.temp_c, humidity_pct: env.humidity_pct, dose_rate_usv_h: env.dose_rate_usv_h, source: "nasa-osdr-eda" };
  cache.clear(); save();
  return { rows: env.ts.length, mean_co2_mmhg: Math.round((env.co2_mmhg.reduce((a, b) => a + b, 0) / env.ts.length) * 1000) / 1000, time_basis: note, series: C.ENV_SERIES.filter((k) => env[k].some((v) => v != null)) };
}

export function seedDemo(planted = true, days = 60, seed = 24) {
  const cfg = { ...sim.defaults, days, seed, planted }, env = sim.simulateEnvironment(cfg), rows = sim.simulateCrew(env, cfg), s = reset();
  sim.CREW.forEach((p, i) => s.astronauts.push({ id: i + 1, callsign: p.callsign, role: p.role }));
  s.env = env;
  rows.forEach((r) => s.checkins.push({ id: s.nextId++, astronaut_id: r.person + 1, ts: r.ts, headache: r.headache, vision: r.vision, congestion: r.congestion, fatigue: r.fatigue, sleep_quality: r.sleep_quality, mood: r.mood, reaction_ms: r.reaction_ms, source: "simulated" }));
  s.meta = { scenario: planted ? "planted" : "none" }; cache.clear(); save();
  return { astronauts: sim.CREW.length, checkins: rows.length, env_rows: env.ts.length, scenario: s.meta.scenario, labeled: "simulated" };
}
export const scenario = () => db().meta.scenario || "live";

// ---- digest ----
const LEVEL = { normal: "Normal", watch: "Watch", alert: "Alert", escalate: "Escalate", calibrating: "Calibrating" };
const utc = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z" : "n/a");

export function digestData() {
  const env = envSummary(), now = missionNow(), crew = listCrew().map((a) => {
    const st = status(a.id); let f = null;
    for (const i of st.insights) if (i.status === "ok" && i.confidence !== "none" && (!f || i.p < f.p)) f = { symptom: i.symptom, contributor: i.env_label, lag_h: i.lag_h, confidence: i.confidence, p: i.p };
    return { callsign: a.callsign, level: st.level, reason: st.reason, persistent: st.persistent, finding: f, actions: st.cards.map((c) => c.title).slice(0, 3) };
  });
  return { generated: utc(now), mission_clock_ts: now, scenario: scenario(), co2: { status: env.status, mean_1h_mmhg: env.mean_1h_mmhg, mean_24h_mmhg: env.mean_24h_mmhg, mean_7d_mmhg: env.mean_7d_mmhg }, crew, disclaimer: C.DISCLAIMER };
}
export function digestText(fmt) {
  const d = digestData();
  if (fmt !== "md") return JSON.stringify(d, null, 2);
  const L = [`# CrewCompass health digest · ${d.generated}`, "", `**Cabin CO2**: ${String(d.co2.status).replace(/_/g, " ")} · 1 h ${d.co2.mean_1h_mmhg} · 24 h ${d.co2.mean_24h_mmhg} · 7 d ${d.co2.mean_7d_mmhg} mmHg`, "", "## Crew", ""];
  for (const c of d.crew) {
    L.push(`- **${c.callsign}**: ${LEVEL[c.level]}. ${c.reason}`);
    if (c.finding) L.push(`  - Possible contributor to ${c.finding.symptom}: ${c.finding.contributor} (about ${c.finding.lag_h} h earlier), confidence ${c.finding.confidence}.`);
    if (c.actions.length) L.push("  - Suggested: " + c.actions.join("; "));
  }
  return [...L, "", `_${d.disclaimer}_`].join("\n");
}

// ---- planted-signal validation (in memory) ----
export function runValidation(seeds = 10) {
  const out = {};
  for (const planted of [true, false]) {
    let found = 0, falseAlarm = 0, rightSeries = 0, rightLag = 0, total = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const cfg = { ...sim.defaults, planted, seed }, env = sim.simulateEnvironment(cfg), rows = sim.simulateCrew(env, cfg);
      for (let p = 0; p < sim.CREW.length; p++) {
        const r = rows.filter((x) => x.person === p), res = analyze(r.map((x) => x.ts), r.map((x) => x.headache), env, 1);
        total++; const sig = res.status === "ok" && res.p < 0.05; if (!sig) continue;
        if (planted) { found++; if (res.env === "co2_mmhg") { rightSeries++; if (Math.abs(res.lag_h - cfg.lag_hours) <= 12) rightLag++; } } else falseAlarm++;
      }
    }
    out[planted ? "planted" : "none"] = planted
      ? { tests: total, detected: found, detection_rate: Math.round((found / total) * 1000) / 1000, co2_identified: rightSeries, lag_within_12h: rightLag }
      : { tests: total, false_alarms: falseAlarm, false_alarm_rate: Math.round((falseAlarm / total) * 1000) / 1000 };
  }
  return { ...out, seeds, design: { true_lag_h: 12, symptom: "headache", alpha: 0.05, note: "Symptoms are simulated; link strength is illustrative." } };
}
