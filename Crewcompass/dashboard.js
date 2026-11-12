import { api } from "../api.js";
import { h, mount, toast } from "../ui/dom.js";
import { pill, card, pageHeader, sourceBanner, skeletons, emptyState, errorState } from "../ui/components.js";
import { sparkline } from "../ui/charts.js";
import { fmtNum, fmtClock, ago } from "../format.js";

function gauge(env) {
  const max = 4;                                    // gauge spans 0-4 mmHg
  const pos = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const m7 = env.mean_7d_mmhg;
  return h("div", { class: "gauge" },
    h("div", { class: "row spread" },
      h("div", { class: "big" }, m7 === null ? "n/a" : fmtNum(m7, 2), h("small", {}, "mmHg · 7-day mean")),
      pill(env.status)),
    h("div", { class: "gauge-bar", role: "img", "aria-label": `7-day CO2 average ${fmtNum(m7)} mmHg` },
      h("div", { class: "tick", style: `left:${pos(env.thresholds.guidance_7d_mmhg)}` }, h("span", {}, "2.5")),
      h("div", { class: "tick", style: `left:${pos(env.thresholds.limit_mmhg)}` }, h("span", {}, "3.0")),
      m7 !== null ? h("div", { class: "needle", style: `left:${pos(m7)}` }) : null),
    h("p", { class: "dim small", style: "margin-top:22px" }, env.message, " Ticks: 2.5 mmHg 7-day guidance, 3.0 mmHg limit."),
    h("div", { class: "kv" },
      h("div", {}, h("b", {}, fmtNum(env.mean_1h_mmhg)), h("span", {}, "1-hour mean")),
      h("div", {}, h("b", {}, fmtNum(env.mean_24h_mmhg)), h("span", {}, "24-hour mean")),
      h("div", {}, h("b", {}, `${env.latest_ppm.toLocaleString()}`), h("span", {}, "now, ppm"))));
}

function crewCard(a, now) {
  return h("a", { class: `card crew-card ${a.level}`, href: `#insights-${a.id}`, "aria-label": `${a.callsign}, ${a.level}` },
    h("div", { class: "row spread" }, h("div", {}, h("div", { class: "name" }, a.callsign), h("div", { class: "role" }, a.role)), pill(a.level)),
    h("p", { class: "reason" }, a.reason),
    h("div", { class: "row spread small muted" }, h("span", {}, `${a.checkins} check-ins`), h("span", {}, ago(a.last_checkin, now))),
    a.spark ? sparkline(a.spark, { width: 220, height: 34 }) : null);
}

export async function render(root, ctx) {
  mount(root, pageHeader("Mission overview", "Crew status against each person's own baseline, and the cabin air they share."), skeletons());
  try {
    const [crew, env] = await Promise.all([api.crew(), api.envSummary()]);
    ctx.setClock(crew.mission_now);
    if (!crew.crew.length) {
      return mount(root, pageHeader("Mission overview", "Nothing here yet."),
        emptyState("No crew data yet. Load the simulated demo to see CrewCompass working.", [
          h("button", { class: "btn primary", onclick: () => seed("planted", ctx) }, "Load demo with a planted CO2 link"),
          h("button", { class: "btn", onclick: () => seed("none", ctx) }, "Load demo with no link")]));
    }
    // headache trend per astronaut for the card sparkline
    await Promise.all(crew.crew.map(async (a) => {
      const hist = (await api.history(a.id)).history;
      a.spark = hist.slice(-21).map((r) => r.headache);
    }));
    const alerts = crew.crew.filter((a) => ["alert", "escalate"].includes(a.level));
    mount(root,
      pageHeader("Mission overview", "Crew status against each person's own baseline, and the cabin air they share."),
      sourceBanner(crew.scenario),
      h("div", { class: "grid hero" },
        card("Cabin CO2", env.available ? gauge(env) : h("p", { class: "muted" }, env.message)),
        card("Today", h("div", { class: "stack" },
          h("div", { class: "row" }, pill(alerts.length ? "alert" : "normal"),
            h("span", {}, alerts.length ? `${alerts.length} of ${crew.crew.length} crew need attention.` : "No persistent changes from baseline.")),
          h("p", { class: "dim small" }, "A single bad day only raises a watch. An alert needs the change to persist, so one rough night does not trigger anything."),
          h("div", { class: "row" },
            h("a", { class: "btn primary", href: "#crewcheck" }, "Start a CrewCheck"),
            h("a", { class: "btn", href: "#digest" }, "Health digest for Earth"))))),
      h("h2", { style: "margin:28px 0 14px;font-size:18px" }, "Crew"),
      h("div", { class: "grid cols-4" }, crew.crew.map((a) => crewCard(a, crew.mission_now))),
      h("p", { class: "footnote" }, "Decision support, not a medical device. Serious signs go to the crew medical officer."));
  } catch (e) { mount(root, pageHeader("Mission overview"), errorState(e, () => render(root, ctx))); }
}

async function seed(scenario, ctx) {
  try { await api.seed(scenario); toast("Demo data loaded (simulated)."); ctx.refresh(); }
  catch (e) { toast(e.message, true); }
}
export { seed };
