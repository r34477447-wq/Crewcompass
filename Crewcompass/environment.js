import { api } from "../api.js";
import { h, mount, toast } from "../ui/dom.js";
import { card, pageHeader, pill, skeletons, errorState } from "../ui/components.js";
import { lineChart } from "../ui/charts.js";
import { fmtDate, fmtNum } from "../format.js";

const PPM = 760 / 1e6;

export async function render(root, ctx, params, state = { unit: "mmhg", days: 14 }) {
  mount(root, pageHeader("Cabin environment"), skeletons());
  try {
    const [sum, ser] = await Promise.all([api.envSummary(), api.envSeries(state.days * 24, state.days > 30 ? 4 : 1)]);
    const pts = ser.points;
    const toUnit = (v) => (v == null ? null : state.unit === "ppm" ? v / PPM : v);
    const th = sum.available ? sum.thresholds : { guidance_7d_mmhg: 2.5, limit_mmhg: 3 };
    const x = (p) => p.ts;

    const controls = h("div", { class: "row" },
      h("div", { class: "tabs", style: "margin:0" },
        ["mmhg", "ppm"].map((u) => h("button", { "aria-pressed": String(state.unit === u), onclick: () => render(root, ctx, params, { ...state, unit: u }) }, u === "mmhg" ? "mmHg" : "ppm"))),
      h("div", { class: "tabs", style: "margin:0" },
        [7, 14, 30, 60].map((d) => h("button", { "aria-pressed": String(state.days === d), onclick: () => render(root, ctx, params, { ...state, days: d }) }, `${d} d`))));

    const co2 = lineChart({
      title: "Cabin CO2", height: 320, width: 1000, xFormat: fmtDate, yFormat: (v) => (state.unit === "ppm" ? Math.round(v) : v.toFixed(1)),
      series: [{ label: `CO2 (${state.unit === "ppm" ? "ppm" : "mmHg"})`, color: "#4fd1c5", points: pts.map((p) => ({ x: x(p), y: toUnit(p.co2_mmhg) })), width: 1.6 }],
      thresholds: [{ y: toUnit(th.guidance_7d_mmhg), label: "7-day guidance 2.5 mmHg", color: "#f2a33a" },
        { y: toUnit(th.limit_mmhg), label: "limit 3 mmHg", color: "#ff7a85" }],
    });
    const small = (key, label, color, unit) => card(label, lineChart({
      title: label, height: 190, width: 380, xFormat: fmtDate, yFormat: (v) => (+v).toFixed(key === "dose_rate_usv_h" ? 0 : 1),
      series: [{ color, points: pts.map((p) => ({ x: x(p), y: p[key] })), width: 1.4 }] }),
      h("span", { class: "muted small" }, unit));

    const upload = h("input", { type: "file", accept: ".csv,.tsv,.txt", id: "eda", "aria-label": "NASA EDA CSV" });
    const rebase = h("input", { type: "checkbox", id: "rb", checked: true });
    const ingest = card("Load NASA data", h("div", { class: "stack" },
      h("p", { class: "dim small" }, "Upload a CSV exported from the OSDR Environmental Data Application. CO2 in ppm is converted with mmHg = ppm × 760 / 1,000,000."),
      h("div", { class: "row" }, upload,
        h("label", { class: "row small dim", for: "rb" }, rebase, "Replay on the mission clock"),
        h("button", { class: "btn amber", onclick: async (e) => {
          if (!upload.files[0]) return toast("Choose a CSV first.", true);
          e.target.disabled = true;
          try { const r = await api.ingest(upload.files[0], rebase.checked);
            toast(`Loaded ${r.rows} rows, mean CO2 ${r.mean_co2_mmhg} mmHg (${r.time_basis}).`); ctx.refresh();
          } catch (err) { toast(err.message, true); e.target.disabled = false; } } }, "Upload")),
      h("p", { class: "muted small" }, "These tables describe Rodent Research experiment conditions on ISS hardware and matching ground platforms. CrewCompass uses them as a stand-in for a cabin sensor series, not as crew-cabin air.")));

    mount(root,
      pageHeader("Cabin environment", `Source: ${ser.source || "none"}`, controls),
      sum.available ? h("div", { class: "row", style: "margin-bottom:16px" }, pill(sum.status),
        h("span", { class: "dim" }, `${sum.message} 7-day mean ${fmtNum(sum.mean_7d_mmhg)} mmHg (${Math.round(sum.mean_7d_mmhg / PPM).toLocaleString()} ppm).`)) : null,
      card("CO2 against NASA guidance", co2),
      h("div", { class: "grid cols-3", style: "margin-top:20px" },
        small("temp_c", "Temperature", "#7aa7ff", "°C"),
        small("humidity_pct", "Humidity", "#4fd1c5", "% relative"),
        small("dose_rate_usv_h", "Radiation dose rate", "#f2a33a", "µSv/h")),
      h("div", { style: "margin-top:20px" }, ingest),
      h("p", { class: "footnote" }, "Radiation dose data: Space Radiation Analysis Group (SRAG), NASA JSC, via NASA OSDR. Doses are accurate to about 10%."));
  } catch (e) { mount(root, pageHeader("Cabin environment"), errorState(e, () => render(root, ctx, params, state))); }
}
