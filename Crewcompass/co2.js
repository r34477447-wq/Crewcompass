import * as C from "./config.js";

export const ppmToMmhg = (ppm) => ppm * C.MMHG_PER_PPM;
export const mmhgToPpm = (mm) => mm / C.MMHG_PER_PPM;

function windowMean(ts, v, end, hours, minCover = 0.5) {
  let sum = 0, n = 0;
  for (let i = ts.length - 1; i >= 0 && ts[i] > end - hours * 3600; i--) if (ts[i] <= end && v[i] != null) { sum += v[i]; n++; }
  const step = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : 3600;
  const cover = Math.min(1, n / Math.max(1, (hours * 3600) / step));
  return cover < minCover || !n ? [null, cover] : [sum / n, cover];
}
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/** env: {ts:[], co2_mmhg:[]} columns. */
export function summarize(env) {
  const n = env.ts.length;
  if (!n) return { available: false, status: "no_data", message: "No CO2 data yet." };
  const now = env.ts[n - 1], v = env.co2_mmhg;
  const [m1] = windowMean(env.ts, v, now, 1), [m24] = windowMean(env.ts, v, now, 24), [m7, c7] = windowMean(env.ts, v, now, 24 * 7);
  let status = "nominal", message = "7-day average is within guidance.";
  if (m1 != null && m1 >= C.CO2_LIMIT) [status, message] = ["above_limit", "1-hour average is at or above the 3 mmHg limit."];
  else if (m7 != null && m7 >= C.CO2_LIMIT) [status, message] = ["above_limit", "7-day average is at or above the 3 mmHg limit."];
  else if (m7 != null && m7 >= C.CO2_GUIDANCE_7D) [status, message] = ["above_guidance", "7-day average is above the 2.5 mmHg guidance."];
  else if (m7 != null && m7 >= C.CO2_WATCH) [status, message] = ["watch", "7-day average is approaching the 2.5 mmHg guidance."];
  else if (m7 == null) [status, message] = ["insufficient", "Not enough data for a 7-day average yet."];
  return {
    available: true, as_of: now, status, message, latest_mmhg: r3(v[n - 1]), latest_ppm: Math.round(mmhgToPpm(v[n - 1])),
    mean_1h_mmhg: r3(m1), mean_24h_mmhg: r3(m24), mean_7d_mmhg: r3(m7), peak_mmhg: r3(Math.max(...v)), coverage_7d: Math.round(c7 * 100) / 100,
    thresholds: { guidance_7d_mmhg: C.CO2_GUIDANCE_7D, limit_mmhg: C.CO2_LIMIT, watch_mmhg: C.CO2_WATCH },
  };
}
