// Offline shell: cache the app files, and keep the last good API answers for reading offline.
const VERSION = "cc-v1";
const SHELL = ["/", "/css/theme.css", "/css/layout.css", "/css/components.css", "/icon.svg", "/manifest.webmanifest",
  "/js/main.js", "/js/api.js", "/js/format.js", "/js/ui/dom.js", "/js/ui/charts.js", "/js/ui/components.js", "/js/ui/starfield.js",
  "/js/pages/dashboard.js", "/js/pages/crewcheck.js", "/js/pages/insights.js", "/js/pages/environment.js",
  "/js/pages/digest.js", "/js/pages/validation.js", "/js/pages/about.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    // network first, fall back to the last answer we saw
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  // app files: cache first, refresh in the background
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
