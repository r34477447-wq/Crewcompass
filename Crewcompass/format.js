export const LEVEL_LABEL = {
  normal: "Normal", watch: "Watch", alert: "Alert", escalate: "Escalate", calibrating: "Calibrating",
  nominal: "Nominal", above_guidance: "Above guidance", above_limit: "Above limit",
  insufficient: "Not enough data", no_data: "No data",
};
export const METRIC_LABEL = {
  headache: "Headache", vision: "Vision change", congestion: "Congestion", fatigue: "Fatigue",
  sleep_quality: "Sleep quality", mood: "Mood", reaction_ms: "Reaction time",
};
export const METRIC_UNIT = { reaction_ms: " ms" };

export const fmtNum = (v, d = 2) => (v === null || v === undefined ? "n/a" : Number(v).toFixed(d));

export function fmtDate(ts, withTime = false) {
  if (!ts) return "n/a";
  const d = new Date(ts * 1000);
  const base = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return withTime ? `${base} ${d.toISOString().slice(11, 16)}Z` : base;
}

export function fmtClock(ts) {
  if (!ts) return "no data";
  return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export function ago(ts, now) {
  if (!ts || !now) return "no check-in yet";
  const h = Math.round((now - ts) / 3600);
  return h < 24 ? `${h} h before mission clock` : `${Math.round(h / 24)} d before mission clock`;
}

export function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
