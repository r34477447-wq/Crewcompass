import { h } from "./dom.js";
import { LEVEL_LABEL } from "../format.js";

export const pill = (level) => h("span", { class: `pill ${level}` }, LEVEL_LABEL[level] || level);

export const card = (title, body, right = null) =>
  h("section", { class: "card" }, title ? h("h2", {}, h("span", {}, title), right) : null, body);

export function pageHeader(title, subtitle, right) {
  return h("header", { class: "topbar" }, h("div", {}, h("h1", {}, title), subtitle ? h("p", {}, subtitle) : null), right || null);
}

export function sourceBanner(scenario) {
  if (scenario === "live") return null;
  const text = scenario === "planted"
    ? "Symptoms and cabin data are simulated. A CO2 to headache link is planted so the analysis can be checked."
    : "Symptoms and cabin data are simulated. No link is planted, so the analysis should stay quiet.";
  return h("div", { class: "banner", role: "note" }, h("b", {}, "SIMULATED"), h("span", {}, text));
}

export function skeletons(n = 3) {
  return h("div", { class: "grid cols-3" }, Array.from({ length: n }, () => h("div", { class: "skeleton" })));
}

export function emptyState(message, actions = []) {
  return h("div", { class: "empty card" }, h("p", {}, message), h("div", { class: "row" }, actions));
}

export function errorState(err, retry) {
  return h("div", { class: "empty card", role: "alert" },
    h("p", {}, "Could not reach the CrewCompass server."), h("p", { class: "small" }, String(err.message || err)),
    h("button", { class: "btn", onclick: retry }, "Try again"));
}

export function actionCard(c) {
  return h("article", { class: "action" },
    h("h3", {}, c.title), h("p", { class: "why" }, c.why),
    h("ol", {}, c.steps.map((s) => h("li", {}, s))),
    h("p", { class: "esc" }, "Escalate: " + c.escalate));
}
