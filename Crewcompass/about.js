import { api } from "../api.js";
import { h, mount, toast } from "../ui/dom.js";
import { card, pageHeader, skeletons, errorState } from "../ui/components.js";
import { seed } from "./dashboard.js";

export async function render(root, ctx) {
  mount(root, pageHeader("About and data"), skeletons(2));
  try {
    const m = await api.meta();
    mount(root,
      pageHeader("About and data", "What CrewCompass uses, what it maps to, and what it is not."),
      h("div", { class: "grid cols-2" },
        card("NASA requirements we map to", h("div", { class: "stack" },
          h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("tbody", {}, m.requirements.map((r) =>
            h("tr", {}, h("td", { class: "mono small" }, r.id), h("td", {}, h("b", {}, r.what), h("div", { class: "muted small" }, r.how)))))),
          ), h("p", { class: "muted small" }, m.requirements_note))),
        card("NASA data and documents", h("div", { class: "stack" },
          m.sources.map((s) => h("div", {}, s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.name) : h("b", {}, s.name), h("div", { class: "muted small" }, s.use))),
          h("p", { class: "small dim" }, m.acknowledgement)))),
      h("div", { class: "grid cols-2", style: "margin-top:20px" },
        card("Demo data", h("div", { class: "stack" },
          h("p", { class: "dim small" }, "Reload the simulated mission. Choose whether a CO2 to headache link is planted."),
          h("div", { class: "row" },
            h("button", { class: "btn primary", onclick: () => seed("planted", ctx) }, "Planted link"),
            h("button", { class: "btn", onclick: () => seed("none", ctx) }, "No link")))),
        card("Limits", h("ul", { class: "dim small", style: "margin:0;padding-left:18px;display:grid;gap:6px" },
          h("li", {}, "Individual health records are not public, so symptoms are simulated and labeled."),
          h("li", {}, "NASA environment tables here describe experiment conditions, used as a stand-in for cabin sensors."),
          h("li", {}, "Fluid shift is not measured, so cause findings are capped at medium confidence."),
          h("li", {}, "Thresholds for watch, alert and persistence are prototype choices, not NASA values."),
          h("li", {}, m.disclaimer)))));
  } catch (e) { mount(root, pageHeader("About and data"), errorState(e, () => render(root, ctx))); }
}
