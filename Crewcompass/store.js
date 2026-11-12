// In-browser storage. Uses localStorage when it works, memory otherwise (private windows, previews).
const KEY = "crewcompass.db.v1";
let state = null, timer = null;

const blank = () => ({ astronauts: [], checkins: [], env: { ts: [], co2_mmhg: [], temp_c: [], humidity_pct: [], dose_rate_usv_h: [], source: null }, meta: {}, nextId: 1 });

export function db() {
  if (state) return state;
  try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : blank(); } catch { state = blank(); }
  if (!state.astronauts) state = blank();
  return state;
}
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be blocked or full */ } }, 150);
}
export function reset() { state = blank(); save(); return state; }
export function version() { const s = db(), n = s.checkins.length; return `${n}:${n ? s.checkins[n - 1].ts : 0}:${s.env.ts.length}:${s.env.ts.length ? s.env.ts[s.env.ts.length - 1] : 0}`; }
