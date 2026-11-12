// Standalone API: the same interface as api.js, but the analysis runs in the browser. No server needed.
import * as S from "./engine/service.js";
import { META } from "./engine/meta.js";
import { db } from "./engine/store.js";

// first run: load the simulated mission so the app is never empty
if (!db().astronauts.length) S.seedDemo(true);

const later = (fn) => new Promise((resolve, reject) => setTimeout(() => { try { resolve(fn()); } catch (e) { reject(e); } }, 0));

export const api = {
  crew: () => later(() => ({ crew: S.crewOverview(), mission_now: S.missionNow(), scenario: S.scenario() })),
  status: (id) => later(() => S.status(id)),
  history: (id) => later(() => ({ history: S.history(id) })),
  envSummary: () => later(() => S.envSummary()),
  envSeries: (hours = 336, step = 1) => later(() => S.envSeries(hours, step)),
  ingest: async (file, rebase = true) => { const text = await file.text(); return later(() => S.ingestEda(text, rebase)); },
  seed: (scenario) => later(() => S.seedDemo(scenario === "planted")),
  digest: (fmt) => later(() => { const text = S.digestText(fmt); return { text, bytes: new TextEncoder().encode(text).length }; }),
  validation: (seeds = 10) => later(() => S.runValidation(seeds)),
  meta: () => later(() => META),
  health: () => later(() => ({ ok: true, mode: "standalone" })),
  checkin: (data) => later(() => { const r = S.addCheckin(data.astronaut_id, data); return { ...r, status: S.status(data.astronaut_id) }; }),
};
export const queued = () => [];
export async function submitCheckin(data) { return { sent: true, res: await api.checkin(data) }; }
export async function flushQueue() { return 0; }
