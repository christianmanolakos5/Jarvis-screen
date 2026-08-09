/* ============================================================
   Service worker — keeps the installed home-screen app up to date.

   Without this, iOS freezes a copy of the app at install time and never
   picks up new code, so fixes shipped later never reach it. Strategy is
   network-first: always try for the latest, fall back to the cached copy
   only when offline.
   ============================================================ */

const CACHE = "jarvis-v1";
const ASSETS = [
  "./", "./index.html", "./style.css", "./script.js", "./manifest.json",
  "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  // Take over immediately rather than waiting for every tab to close.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Only manage our own files; let API calls and CDN loads go straight out.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Store a fresh copy for offline use.
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});

/* The page asks for the newest code after an update is found. */
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
