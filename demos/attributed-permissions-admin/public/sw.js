const CACHE = "apa-v1";
const STATIC = ["/styles.css", "/htmx.min.js", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Cache-first for static assets
  if (STATIC.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached ?? fetch(e.request))
    );
    return;
  }

  // Network-first for everything else (live DB data)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
