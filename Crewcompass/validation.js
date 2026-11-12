import { api } from "../api.js";
import { h, mount } from "../ui/dom.js";
import { card, pageHeader, skeletons, errorState } from "../ui/components.js";

const pct = (v) => `${Math.round(v * 100)}%`;
const bar = (label, value, amber) => h("div", { class: "bar-row" }, h("span", {}, label),
  h("div", { class: "bar-track" }, h("div", { class: "bar-fill" + (amber ? " amber" : ""), style: `width:${Math.round(value * 100)}%` })),
  h("b", { class: "mono" }, pct(value)));

export async function render(root, ctx) {
  mount(root, pageHeader("Validation", "Plant a known link and see if the analysis finds it. Plant none and see if it stays quiet."), skeletons(2));
  try {
    const v = await api.validation(20);
    const p = v.planted, n = v.none;
    mount(root,
      pageHeader("Validation", "Plant a known link and see if the analysis finds it. Plant none and see if it stays quiet."),
      h("div", { class: "grid cols-2" },
        card("Link planted: CO2 to headache, 12 h lag", h("div", { class: "bars" },
          bar("Detected (p < 0.05)", p.detection_rate),
          bar("…and named CO2", p.co2_identified / p.tests),
          bar("…and lag within 12 h", p.lag_within_12h / p.tests),
          h("p", { class: "muted small" }, `${p.tests} astronaut series across ${v.seeds} simulated missions.`))),
        card("No link planted", h("div", { class: "bars" },
          bar("False alarms (p < 0.05)", n.false_alarm_rate, true),
          h("p", { class: "dim small" }, `${n.false_alarms} of ${n.tests} series raised a false alarm. With a 0.05 threshold, about 5% would be expected by chance.`)))),
      h("div", { style: "margin-top:20px" }, card("How to read this", h("div", { class: "stack small dim" },
        h("p", {}, "Symptoms here are simulated, because individual astronaut records are not public. The strength of the planted link is illustrative, so these rates show that the method works, not how strong the real CO2 effect is."),
        h("p", {}, "The test statistic is the strongest correlation across four environment series and thirteen lags. Its p-value comes from block-shuffling the symptom series, which accounts for that search."),
        h("p", {}, "Next step: calibrate the simulator from the CO2 and headache analysis in NASA's technical brief OCHMO-TB-004 and re-run.")))));
  } catch (e) { mount(root, pageHeader("Validation"), errorState(e, () => render(root, ctx))); }
}
