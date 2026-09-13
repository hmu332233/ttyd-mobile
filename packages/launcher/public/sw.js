// Network-first with cache fallback. Bump CACHE on every deploy that changes assets.
const CACHE = "terminals-v7";
const PRECACHE = ["/", "/index.html", "/vapor.css", "/styles.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  // Navigation requests (incl. ?add=...) always resolve to the app shell.
  const target = request.mode === "navigate" ? new Request("/index.html") : request;
  event.respondWith(
    fetch(target)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(target, response.clone()));
        return response;
      })
      .catch(() => caches.match(target)),
  );
});
