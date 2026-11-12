import { api, submitCheckin, queued } from "../api.js";
import { h, mount, toast } from "../ui/dom.js";
import { card, pageHeader, pill, errorState } from "../ui/components.js";

const SLIDERS = [
  ["headache", "Headache", "none", "severe"],
  ["vision", "Change in vision", "none", "severe"],
  ["congestion", "Congestion / stuffy head", "none", "severe"],
  ["fatigue", "Fatigue", "rested", "exhausted"],
  ["sleep_quality", "Sleep last night", "poor", "great"],
];
const MOODS = [["1", "😣", "Low"], ["2", "😕", "Down"], ["3", "😐", "OK"], ["4", "🙂", "Good"], ["5", "😄", "Great"]];
const TRIALS = 5;

export async function render(root, ctx, params) {
  mount(root, pageHeader("CrewCheck", "About 60 seconds. Same questions every day, so changes stand out."));
  let crew;
  try { crew = (await api.crew()); } catch (e) { return mount(root, pageHeader("CrewCheck"), errorState(e, () => render(root, ctx, params))); }
  ctx.setClock(crew.mission_now);
  if (!crew.crew.length) return mount(root, pageHeader("CrewCheck"), card(null, h("p", { class: "muted" }, "Load the demo from the Mission overview first.")));

  const state = {
    who: Number(params[0]) || crew.crew[0].id, step: 0, started: null,
    values: { headache: 1, vision: 0, congestion: 1, fatigue: 3, sleep_quality: 6 }, mood: null, rts: [],
  };
  const stage = h("div");
  const bar = h("div", { class: "steps", "aria-hidden": "true" });
  const timer = h("span", { class: "timer", "aria-live": "off" });
  let tick;

  const paintBar = () => mount(bar, ...[0, 1, 2, 3].map((i) => h("span", { class: i < state.step ? "done" : i === state.step ? "now" : "" })));
  const startClock = () => {
    state.started = state.started || Date.now();
    clearInterval(tick);
    tick = setInterval(() => { timer.textContent = `${Math.round((Date.now() - state.started) / 1000)} s`; }, 500);
  };
  const go = (n) => { state.step = n; draw(); };

  function sliders() {
    return h("div", { class: "stack" },
      SLIDERS.map(([k, label, lo, hi]) => {
        const out = h("output", { for: k }, state.values[k]);
        return h("div", { class: "field" },
          h("label", { for: k }, h("span", {}, label), out),
          h("input", { id: k, type: "range", min: 0, max: 10, step: 1, value: state.values[k],
            oninput: (e) => { state.values[k] = Number(e.target.value); out.textContent = e.target.value; startClock(); } }),
          h("div", { class: "scale" }, h("span", {}, lo), h("span", {}, hi)));
      }),
      h("div", { class: "row spread" }, h("span"), h("button", { class: "btn primary", onclick: () => go(1) }, "Next")));
  }

  function mood() {
    return h("div", { class: "stack" }, h("p", { class: "label" }, "How is your mood today?"),
      h("div", { class: "moods", role: "group", "aria-label": "Mood" }, MOODS.map(([v, e, t]) =>
        h("button", { type: "button", "aria-pressed": String(state.mood === Number(v)),
          onclick: () => { state.mood = Number(v); startClock(); draw(); } }, h("b", {}, e), t))),
      h("div", { class: "row spread" }, h("button", { class: "btn ghost", onclick: () => go(0) }, "Back"),
        h("button", { class: "btn primary", disabled: state.mood === null, onclick: () => go(2) }, "Next")));
  }

  function reaction() {
    const pad = h("div", { class: "rt-pad", role: "button", tabindex: 0 });
    const dots = h("div", { class: "dots" }, Array.from({ length: TRIALS }, (_, i) => h("i", { class: i < state.rts.length ? "on" : "" })));
    let phase = "idle", t0 = 0, timeout;
    const set = (cls, main, sub) => { pad.className = "rt-pad " + cls; mount(pad, h("div", {}, main, h("small", {}, sub))); };
    const idle = () => set("", state.rts.length ? "Tap to start the next trial" : "Tap to start", "Wait for teal, then tap as fast as you can. " + (TRIALS - state.rts.length) + " to go.");
    const arm = () => {
      phase = "wait"; set("wait", "Wait…", "Do not tap yet");
      timeout = setTimeout(() => { phase = "go"; t0 = performance.now(); set("go", "TAP NOW", ""); }, 1000 + Math.random() * 2200);
    };
    const press = () => {
      if (phase === "idle") return arm();
      if (phase === "wait") { clearTimeout(timeout); phase = "idle"; set("", "Too early", "Tap to try that trial again"); return; }
      if (phase === "go") {
        const ms = Math.round(performance.now() - t0); phase = "idle"; state.rts.push(ms);
        mount(dots, ...Array.from({ length: TRIALS }, (_, i) => h("i", { class: i < state.rts.length ? "on" : "" })));
        if (state.rts.length >= TRIALS) return go(3);
        set("", `${ms} ms`, "Tap for the next trial");
      }
    };
    pad.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
    pad.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); press(); } });
    idle();
    return h("div", { class: "stack" }, h("p", { class: "label" }, "Reaction test: 5 quick taps"), pad, dots,
      h("div", { class: "row spread" }, h("button", { class: "btn ghost", onclick: () => { clearTimeout(timeout); go(1); } }, "Back"),
        h("button", { class: "btn ghost", onclick: () => { clearTimeout(timeout); state.rts = []; go(2); } }, "Restart test")));
  }

  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  function review() {
    const rt = Math.round(median(state.rts));
    const payload = { astronaut_id: state.who, ...state.values, mood: state.mood, reaction_ms: rt };
    const secs = Math.round((Date.now() - state.started) / 1000);
    return h("div", { class: "stack" },
      h("table", { class: "data" }, h("tbody", {}, [
        ...SLIDERS.map(([k, l]) => h("tr", {}, h("td", {}, l), h("td", { class: "mono" }, `${state.values[k]} / 10`))),
        h("tr", {}, h("td", {}, "Mood"), h("td", { class: "mono" }, `${state.mood} / 5`)),
        h("tr", {}, h("td", {}, "Reaction (median of 5)"), h("td", { class: "mono" }, `${rt} ms`))])),
      h("p", { class: "muted small" }, `Completed in ${secs} s.`),
      h("div", { class: "row spread" }, h("button", { class: "btn ghost", onclick: () => { state.rts = []; go(2); } }, "Redo reaction test"),
        h("button", { class: "btn primary", onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await submitCheckin(payload);
            clearInterval(tick);
            if (r.sent) { toast("Check-in saved."); done(r.res.status); }
            else { toast("Server unreachable. Saved on this device and will sync automatically."); location.hash = "#overview"; }
          } catch (err) { toast(err.message, true); e.target.disabled = false; }
        } }, "Save check-in")));
  }

  function done(st) {
    mount(stage, h("div", { class: "stack" },
      h("div", { class: "row" }, pill(st.level), h("strong", {}, "Check-in saved")),
      h("p", { class: "dim" }, st.reason),
      h("div", { class: "row" },
        h("a", { class: "btn primary", href: `#insights-${state.who}` }, "See my insights"),
        h("a", { class: "btn", href: "#overview" }, "Back to overview"))));
    mount(bar);
  }

  function draw() {
    paintBar();
    const titles = ["How do you feel?", "Mood", "Reaction time", "Review"];
    const body = [sliders, mood, reaction, review][state.step]();
    mount(stage, h("h2", { style: "font-size:20px;margin-bottom:16px" }, titles[state.step]), body);
  }

  const who = h("select", { id: "who", "aria-label": "Astronaut", onchange: (e) => { state.who = Number(e.target.value); } },
    crew.crew.map((a) => h("option", { value: a.id, selected: a.id === state.who }, `${a.callsign} · ${a.role}`)));
  const pending = queued().length;
  mount(root, pageHeader("CrewCheck", "About 60 seconds. Same questions every day, so changes stand out.", h("div", { class: "row" }, who, timer)),
    pending ? h("div", { class: "banner" }, h("b", {}, "OFFLINE QUEUE"), h("span", {}, `${pending} check-in(s) waiting to sync.`)) : null,
    h("div", { style: "max-width:680px" }, card(null, h("div", {}, bar, stage))),
    h("p", { class: "footnote", style: "max-width:680px" }, "Your answers stay on this vehicle. Serious or sudden symptoms: contact the crew medical officer now, do not wait for the app."));
  ctx.onLeave(() => clearInterval(tick));
  draw();
}
