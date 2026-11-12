import { h } from "./dom.js";

const NS = { l: 52, r: 16, t: 14, b: 28 };

function scale(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

function niceTicks(min, max, n = 4) {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  const mult = err >= 5 ? 10 : err >= 2 ? 5 : err >= 1 ? 2 : 1;
  const s = step * mult;
  const out = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(+v.toFixed(6));
  return out;
}

/**
 * Line chart.
 * series: [{label, color, points:[{x,y}]}], thresholds: [{y, label, color}]
 */
export function lineChart({ series, thresholds = [], height = 250, width = 640, xFormat = String, yFormat = String, yMin, yMax, title }) {
  const pts = series.flatMap((s) => s.points).filter((p) => p.y !== null && p.y !== undefined);
  if (!pts.length) return h("p", { class: "muted" }, "No data to chart yet.");
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y).concat(thresholds.map((t) => t.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1;
  if (yMin === undefined) lo -= pad;
  if (yMax === undefined) hi += pad;
  const X = scale([x0, x1], [NS.l, width - NS.r]);
  const Y = scale([lo, hi], [height - NS.b, NS.t]);

  const svg = h("svg", { class: "chart", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title || "Line chart" });
  if (title) svg.append(h("title", {}, title));
  for (const v of niceTicks(lo, hi)) {
    svg.append(h("line", { class: "grid-line", x1: NS.l, x2: width - NS.r, y1: Y(v), y2: Y(v) }),
      h("text", { x: NS.l - 8, y: Y(v) + 4, "text-anchor": "end" }, yFormat(v)));
  }
  for (const v of niceTicks(x0, x1, 6)) {
    svg.append(h("text", { x: X(v), y: height - 8, "text-anchor": "middle" }, xFormat(v)));
  }
  svg.append(h("line", { class: "axis", x1: NS.l, x2: NS.l, y1: NS.t, y2: height - NS.b }),
    h("line", { class: "axis", x1: NS.l, x2: width - NS.r, y1: height - NS.b, y2: height - NS.b }));

  for (const t of thresholds) {
    if (t.y < lo || t.y > hi) continue;
    svg.append(h("line", { x1: NS.l, x2: width - NS.r, y1: Y(t.y), y2: Y(t.y), stroke: t.color, "stroke-dasharray": "6 5", "stroke-width": 1.5 }),
      h("text", { x: width - NS.r - 4, y: Y(t.y) - 6, "text-anchor": "end", style: `fill:${t.color}` }, t.label));
  }
  for (const s of series) {
    const d = s.points.filter((p) => p.y !== null && p.y !== undefined)
      .map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    svg.append(h("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.opacity ?? 1 }));
  }
  const legend = h("div", { class: "legend" }, series.filter((s) => s.label).map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), s.label)));
  return h("div", {}, svg, series.some((s) => s.label) ? legend : null);
}

/** Bars of correlation r by lag (positive = more exposure, more symptom). */
export function lagChart({ profile, bestLag, height = 220, width = 520 }) {
  const lo = -1, hi = 1;
  const n = profile.length;
  const X = scale([0, n], [NS.l, width - NS.r]);
  const Y = scale([lo, hi], [height - NS.b, NS.t]);
  const bw = (width - NS.l - NS.r) / n * 0.7;
  const svg = h("svg", { class: "chart", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Correlation by lag in hours" });
  for (const v of [-1, -0.5, 0, 0.5, 1]) {
    svg.append(h("line", { class: v === 0 ? "axis" : "grid-line", x1: NS.l, x2: width - NS.r, y1: Y(v), y2: Y(v) }),
      h("text", { x: NS.l - 8, y: Y(v) + 4, "text-anchor": "end" }, v.toFixed(1)));
  }
  profile.forEach((p, i) => {
    const x = X(i) + ((width - NS.l - NS.r) / n - bw) / 2;
    const y0 = Y(0), y1 = Y(p.r);
    const best = p.lag_h === bestLag;
    svg.append(h("rect", {
      x, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 2,
      fill: best ? "#f2a33a" : "#4fd1c5", opacity: best ? 1 : 0.55,
    }, h("title", {}, `lag ${p.lag_h} h: r = ${p.r}`)));
    if (i % 2 === 0) svg.append(h("text", { x: x + bw / 2, y: height - 8, "text-anchor": "middle" }, p.lag_h));
  });
  svg.append(h("text", { x: width - NS.r, y: NS.t + 2, "text-anchor": "end" }, "lag (h)  ·  r"));
  return svg;
}

export function sparkline(values, { width = 120, height = 34, color = "#4fd1c5" } = {}) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (v.length < 2) return h("span", { class: "muted small" }, "n/a");
  const lo = Math.min(...v), hi = Math.max(...v);
  const X = scale([0, v.length - 1], [2, width - 2]);
  const Y = scale([lo, hi === lo ? lo + 1 : hi], [height - 3, 3]);
  const d = v.map((y, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join("");
  return h("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": "trend" },
    h("path", { d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linejoin": "round" }),
    h("circle", { cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 3, fill: color }));
}
