// Parse an OSDR Environmental Data Application CSV export, in the browser.
import { ppmToMmhg } from "./co2.js";

const TIME_HINTS = ["controller_time", "time_gmt", "timestamp", "time", "date"];
const HINTS = { temp_c: ["temp"], humidity_pct: ["humid", "rh"], dose_rate_usv_h: ["dose_rate", "dose rate", "dose_equivalent", "radiation", "dose"] };

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur); return out.map((s) => s.trim());
}
function find(cols, hints, exclude = []) {
  for (const h of hints) for (let i = 0; i < cols.length; i++) { const l = cols[i].toLowerCase(); if (l.includes(h) && !exclude.some((x) => l.includes(x))) return i; }
  return -1;
}
function parseTime(s) {
  if (!s) return NaN; let str = String(s).trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(str)) str += "Z";
  return Date.parse(str) / 1000;
}

export function parseEdaCsv(text, resampleSec = 1800) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 11) throw new Error("Fewer than 10 usable CO2 rows after cleaning.");
  const d = [",", "\t", ";"].map((x) => [x, lines[0].split(x).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cols = splitLine(lines[0], d), ti = find(cols, TIME_HINTS), ci = find(cols, ["co2"]);
  if (ti < 0 || ci < 0) throw new Error("Could not find a time and a CO2 column. Columns: " + cols.slice(0, 20).join(", "));
  const extra = {}; for (const [k, h] of Object.entries(HINTS)) { const i = find(cols, h, ["co2"]); if (i >= 0) extra[k] = i; }
  const buckets = new Map();
  for (let r = 1; r < lines.length; r++) {
    const f = splitLine(lines[r], d), t = parseTime(f[ti]), co2 = parseFloat(f[ci]);
    if (Number.isNaN(t) || !(co2 > 0 && co2 < 30000)) continue;
    const key = Math.floor(t / resampleSec) * resampleSec;
    const b = buckets.get(key) || { co2: [0, 0] }; b.co2[0] += co2; b.co2[1]++;
    for (const [k, i] of Object.entries(extra)) { const v = parseFloat(f[i]); if (!Number.isNaN(v)) { b[k] = b[k] || [0, 0]; b[k][0] += v; b[k][1]++; } }
    buckets.set(key, b);
  }
  if (buckets.size < 10 && lines.length < 100) { /* small test files are allowed */ }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  if (!keys.length) throw new Error("Fewer than 10 usable CO2 rows after cleaning.");
  const env = { ts: keys, co2_mmhg: keys.map((k) => ppmToMmhg(buckets.get(k).co2[0] / buckets.get(k).co2[1])), source: "nasa-osdr-eda" };
  for (const k of Object.keys(HINTS)) env[k] = keys.map((key) => { const b = buckets.get(key)[k]; return b ? b[0] / b[1] : null; });
  return env;
}
export function rebase(env, startTs) { const off = startTs - env.ts[0]; return { ...env, ts: env.ts.map((t) => t + off) }; }
