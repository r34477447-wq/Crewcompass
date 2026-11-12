import { h, mount, toast } from "./ui/dom.js";
import { drawStars } from "./ui/starfield.js";
import { api, flushQueue } from "./api.js";
import { fmtClock } from "./format.js";

const ICONS = {
  overview: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  check: "M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z",
  insights: "M3 17l5-5 4 4 8-9M14 7h6v6",
  env: "M12 3v10M8 9a4 4 0 108 0M4 20h16",
  digest: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  valid: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  about: "M12 8h.01M11 12h1v5h1M12 3a9 9 0 100 18 9 9 0 000-18z",
};
const ROUTES = [
  { path: "overview", name: "Overview", icon: "overview", mod: () => import("./pages/dashboard.js") },
  { path: "crewcheck", name: "CrewCheck", icon: "check", mod: () => import("./pages/crewcheck.js") },
  { path: "insights", name: "Insights", icon: "insights", mod: () => import("./pages/insights.js") },
  { path: "environment", name: "Environment", icon: "env", mod: () => import("./pages/environment.js") },
  { path: "digest", name: "Earth digest", icon: "digest", mod: () => import("./pages/digest.js") },
  { path: "validation", name: "Validation", icon: "valid", mod: () => import("./pages/validation.js") },
  { path: "about", name: "About", icon: "about", mod: () => import("./pages/about.js") },
];

const icon = (k) => h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, h("path", { d: ICONS[k] }));
const logo = () => h("svg", { viewBox: "0 0 40 40", "aria-hidden": "true" },
  h("circle", { cx: 20, cy: 20, r: 17, fill: "none", stroke: "#4fd1c5", "stroke-width": 2 }),
  h("polygon", { points: "20,7 24,20 20,33 16,20", fill: "#f2a33a" }),
  h("polygon", { points: "7,20 20,16 33,20 20,24", fill: "#4fd1c5", opacity: 0.9 }));

const clockEl = h("b", {}, "—");
const connEl = h("span", { class: "conn" }, h("i"), "ONBOARD");
const sidebarNav = h("nav", { class: "nav", "aria-label": "Main" });
const tabbar = h("nav", { class: "tabbar", "aria-label": "Main" });
const view = h("main", { class: "main", id: "view", tabindex: -1 });

let leaveHooks = [];
const ctx = {
  setClock(ts) { clockEl.textContent = fmtClock(ts); },
  refresh() { route(); },
  onLeave(fn) { leaveHooks.push(fn); },
};

function paintNav(active) {
  const link = (r, i) => h("a", { href: "#" + r.path, "aria-current": i === active ? "page" : null }, icon(r.icon), r.name);
  mount(sidebarNav, ROUTES.map(link));
  mount(tabbar, ROUTES.filter((r) => r.path !== "validation").map((r) => link(r, ROUTES.indexOf(r))).map((a, i) => a));
}

async function route() {
  leaveHooks.forEach((f) => f()); leaveHooks = [];
  const [first = "overview", ...params] = location.hash.slice(1).split("-");
  let idx = ROUTES.findIndex((r) => r.path === first);
  if (idx < 0) idx = 0;
  paintNav(idx);
  document.title = `${ROUTES[idx].name} · CrewCompass`;
  const mod = await ROUTES[idx].mod();
  await mod.render(view, ctx, params);
  view.focus({ preventScroll: true });
  scrollTo(0, 0);
}

async function checkConn() {
  try { await api.health(); connEl.className = "conn"; connEl.lastChild.textContent = "ONBOARD"; }
  catch { connEl.className = "conn off"; connEl.lastChild.textContent = "OFFLINE"; return; }
  const n = await flushQueue();
  if (n) { toast(`${n} queued check-in(s) synced.`); route(); }
}

function boot() {
  const canvas = h("canvas", { id: "stars", "aria-hidden": "true" });
  document.body.prepend(canvas);
  drawStars(canvas);
  addEventListener("resize", () => drawStars(canvas));

  const sidebar = h("aside", { class: "sidebar" },
    h("a", { class: "brand", href: "#overview" }, logo(), h("div", {}, h("b", {}, "CrewCompass"), h("small", {}, "CREW HEALTH"))),
    sidebarNav,
    h("div", { class: "foot" }, h("div", { class: "clock" }, "MISSION CLOCK", clockEl), connEl,
      h("span", {}, "Decision support, not a medical device.")));
  const app = h("div", { class: "app" }, sidebar, view);
  document.getElementById("root").replaceWith(app);
  document.body.append(tabbar);

  addEventListener("hashchange", route);
  addEventListener("online", checkConn);
  addEventListener("offline", checkConn);
  checkConn(); setInterval(checkConn, 30000);
  route();

  if ("serviceWorker" in navigator && !window.__STANDALONE__ && location.protocol.startsWith("http")) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
