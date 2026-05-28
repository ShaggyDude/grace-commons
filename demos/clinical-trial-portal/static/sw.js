// sw.js — Beacon Clinical Research Portal service worker
//
// Strategy:
//   Static assets (/static/)  → cache-first  (styles, icons, scripts — safe to serve stale)
//   Everything else            → network-first (clinical data must be fresh)
//
// On install: pre-cache static shell so the app loads offline.
// On activate: purge old cache versions.

const CACHE = "beacon-v1";

const PRECACHE = [
  "/static/styles.css",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

// ── Install ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/static/")) {
    // Cache-first: static assets are versioned by cache name.
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ?? fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
      )
    );
  } else {
    // Network-first: clinical data must always be fresh.
    // Fall back to cache only if the network is unavailable.
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});
