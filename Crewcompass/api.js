// API client plus an offline queue for check-ins.
const QUEUE_KEY = "crewcompass.queue.v1";

async function req(path, opts = {}) {
  const res = await fetch("/api" + path, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error((body && body.error) || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  crew: () => req("/crew"),
  status: (id) => req(`/crew/${id}/status`),
  history: (id) => req(`/crew/${id}/history`),
  envSummary: () => req("/environment/summary"),
  envSeries: (hours = 24 * 14, step = 1) => req(`/environment/series?hours=${hours}&step=${step}`),
  ingest: (file, rebase = true) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("rebase", rebase ? "1" : "0");
    return req("/environment/ingest", { method: "POST", body: fd });
  },
  seed: (scenario) => req("/demo/seed", json("POST", { scenario })),
  digest: async (fmt) => {
    const res = await fetch(`/api/digest?format=${fmt}`);
    if (!res.ok) throw new Error("digest failed");
    return { text: await res.text(), bytes: Number(res.headers.get("X-Size-Bytes") || 0) };
  },
  validation: (seeds = 10) => req(`/validation?seeds=${seeds}`),
  meta: () => req("/meta"),
  health: () => req("/health"),
  checkin: (data) => req("/checkins", json("POST", data)),
};

// ---- offline queue: a check-in is never lost if the server is unreachable ----
export function queued() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage may be blocked */ } }

export async function submitCheckin(data) {
  try {
    const res = await api.checkin(data);
    return { sent: true, res };
  } catch (e) {
    if (e.status && e.status < 500) throw e;          // a real validation error: do not queue
    saveQueue([...queued(), { data, at: Date.now() }]);
    return { sent: false };
  }
}

export async function flushQueue() {
  const q = queued();
  if (!q.length) return 0;
  const left = [];
  let sent = 0;
  for (const item of q) {
    try { await api.checkin(item.data); sent++; } catch (e) { if (!e.status || e.status >= 500) left.push(item); }
  }
  saveQueue(left);
  return sent;
}
