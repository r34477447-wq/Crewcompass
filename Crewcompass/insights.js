import { api } from "../api.js";
import { h, mount } from "../ui/dom.js";
import { card, pageHeader, pill, skeletons, errorState, actionCard, sourceBanner } from "../ui/components.js";
import { lagChart, lineChart } from "../ui/charts.js";
import { METRIC_LABEL, fmtNum, fmtDate, LEVEL_LABEL } from "../format.js";

const conf = (c) => h("span", { class: `conf ${c}` }, c === "none" ? "no link found" : `confidence: ${c}`);

function zstrip(m) {
  if (!m.recent_z) return h("span", { class: "muted small" }, "calibrating");
  return h("span", { class: "zstrip", role: "img", "aria-label": `recent z-scores ${m.recent_z.join(", ")}` },
    m.recent_z.map((z) => h("i", { class: z >= 2 ? "bad" : "", style: `height:${Math.max(3, Math.min(26, Math.abs(z) * 8))}px` })));
}

function metricTable(st) {
  return h("div", { class: "table-wrap" }, h("table", { class: "data" },
    h("thead", {}, h("tr", {}, ["Measure", "Latest", "Own baseline", "Last 5 days", "State"].map((t) => h("th", {}, t)))),
    h("tbody", {}, Object.values(st.metrics).map((m) => h("tr", {},
      h("td", {}, METRIC_LABEL[m.metric]),
      h("td", { class: "mono" }, fmtNum(m.latest, 1)),
      h("td", { class: "mono" }, m.baseline === null ? "n/a" : fmtNum(m.baseline, 1)),
      h("td", {}, zstrip(m)),
      h("td", {}, pill(m.state === "persistent" ? "alert" : m.state)))))));
}

function finding(ins) {
  if (ins.status !== "ok") return h("div", { class: "finding" }, h("h3", {}, METRIC_LABEL[ins.symptom]), h("p", { class: "stmt muted" }, ins.message));
  const has = ins.confidence !== "none";
  const stmt = has
    ? `${ins.env_label} ${ins.lag_h} h earlier goes with ${ins.direction} ${METRIC_LABEL[ins.symptom].toLowerCase()} (r = ${ins.r}, p = ${ins.p}, ${ins.n} days). Possible contributor, not proof: fluid shift is not measured.`
    : `No environment series lines up with ${METRIC_LABEL[ins.symptom].toLowerCase()} beyond chance (best r = ${ins.r}, p = ${ins.p}).`;
  return h("div", { class: "finding" },
    h("h3", {}, METRIC_LABEL[ins.symptom], conf(ins.confidence)),
    h("p", { class: "stmt" }, stmt),
    has ? h("div", {}, lagChart({ profile: ins.profile[ins.env], bestLag: ins.lag_h }),
      h("p", { class: "muted small" }, `${ins.env_label}: correlation by lag. Amber bar is the strongest.`)) : null);
}

export async function render(root, ctx, params) {
  mount(root, pageHeader("Insights"), skeletons());
  try {
    const crew = await api.crew();
    ctx.setClock(crew.mission_now);
    if (!crew.crew.length) return mount(root, pageHeader("Insights"), card(null, h("p", { class: "muted" }, "No data yet. Load the demo from the overview.")));
    const id = Number(params[0]) || crew.crew[0].id;
    const [st, hist] = await Promise.all([api.status(id), api.history(id)]);
    const who = crew.crew.find((a) => a.id === id);
    const rows = hist.history;
    const tabs = h("nav", { class: "tabs", "aria-label": "Crew member" }, crew.crew.map((a) =>
      h("a", { href: `#insights-${a.id}`, "aria-current": String(a.id === id) }, a.callsign)));

    const trend = lineChart({
      title: `${who.callsign} headache and fatigue, daily`, height: 300, width: 520, yMin: 0, yMax: 10,
      xFormat: (v) => fmtDate(v), yFormat: (v) => v,
      series: [
        { label: "Headache", color: "#f2a33a", points: rows.map((r) => ({ x: r.ts, y: r.headache })) },
        { label: "Fatigue", color: "#4fd1c5", points: rows.map((r) => ({ x: r.ts, y: r.fatigue })), opacity: 0.8 }],
      thresholds: Object.hasOwn(st.metrics, "headache") && st.metrics.headache.baseline !== null
        ? [{ y: st.metrics.headache.baseline, label: "baseline", color: "#8fa0b8" }] : [],
    });

    const order = [...st.insights].sort((a, b) => (a.p ?? 2) - (b.p ?? 2));
    mount(root,
      pageHeader(`${who.callsign} · ${who.role}`, "Compared only with their own recent history.", h("div", { class: "row" }, pill(st.level))),
      sourceBanner((await api.crew()).scenario), tabs,
      h("div", { class: "grid cols-2" },
        card("Status", h("div", { class: "stack" }, h("p", {}, st.reason), metricTable(st),
          h("p", { class: "muted small" }, "Bars show the last 5 days against the astronaut's own baseline; amber means 2+ spreads worse. An alert needs 3 bad days of 5 (vision: 2 of 3)."))),
        card("Trend", trend)),
      h("h2", { style: "margin:28px 0 14px;font-size:18px" }, "Possible causes"),
      h("div", { class: "grid cols-2" }, order.map((i) => card(null, finding(i)))),
      h("h2", { style: "margin:28px 0 14px;font-size:18px" }, "What to do next"),
      h("div", { class: "grid cols-2" }, st.cards.map(actionCard)),
      h("p", { class: "footnote" }, "Link strength comes from a block-shuffle test over all environment series and lags (0 to 72 h), so searching many lags is already accounted for. Confidence is capped at medium. Action cards are examples to be approved by flight surgeons. Decision support, not a medical device."));
  } catch (e) { mount(root, pageHeader("Insights"), errorState(e, () => render(root, ctx, params))); }
}
