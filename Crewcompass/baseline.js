import * as C from "./config.js";

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x) => Math.round(x * 100) / 100;

function robust(value, hist, metric) {
  const med = median(hist), mad = median(hist.map((x) => Math.abs(x - med))) * C.MAD_SCALE, spread = Math.max(mad, C.MIN_SCALE[metric]);
  return [(value - med) / spread, med, spread];
}

export function evaluateMetric(values, metric) {
  const n = values.length, recentN = Math.min(C.RECENT_DAYS, n);
  const base = values.slice(0, n - recentN).slice(-C.BASELINE_MAX);
  const out = { metric, latest: n ? values[n - 1] : null, n };
  if (base.length < C.BASELINE_MIN) return { ...out, state: "calibrating", z: null, baseline: null, bad_days: 0 };
  const sign = C.WORSE[metric];
  const zs = values.slice(-recentN).map((x) => sign * robust(x, base, metric)[0]);
  const bad = zs.map((z) => z >= C.Z_FLAG), badDays = bad.filter(Boolean).length;
  let persistent;
  if (metric === "vision") { const [need, win] = C.VISION_PERSIST; persistent = bad.slice(-win).filter(Boolean).length >= need; }
  else persistent = badDays >= C.PERSIST_DAYS;
  const watch = bad[bad.length - 1] && !persistent;
  const [, med, spread] = robust(values[n - 1], base, metric);
  return { ...out, state: persistent ? "persistent" : watch ? "watch" : "normal", z: r2(zs[zs.length - 1]), baseline: r2(med), spread: r2(spread), bad_days: badDays, recent_z: zs.map(r2) };
}

export function evaluateAstronaut(history) {
  const metrics = {};
  for (const m of C.METRICS) if (history[m] && history[m].length) metrics[m] = evaluateMetric(history[m], m);
  const all = Object.values(metrics), keys = Object.keys(metrics);
  const persistent = keys.filter((k) => metrics[k].state === "persistent"), watching = keys.filter((k) => metrics[k].state === "watch");
  let level, reason;
  if (!all.length || all.every((m) => m.state === "calibrating")) [level, reason] = ["calibrating", "Building a personal baseline."];
  else if (persistent.includes("vision")) [level, reason] = ["escalate", "Persistent vision change: contact the crew medical officer."];
  else if (persistent.length >= 3) [level, reason] = ["escalate", "Several measures are persistently off baseline."];
  else if (persistent.length) [level, reason] = ["alert", "Persistent change from baseline: " + persistent.join(", ") + "."];
  else if (watching.length) [level, reason] = ["watch", "Today differs from baseline: " + watching.join(", ") + "."];
  else [level, reason] = ["normal", "Within the astronaut's own baseline."];
  return { level, reason, persistent, watching, metrics };
}
