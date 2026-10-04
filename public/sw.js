/* Service Worker — Ma Bibliothèque BD (PWA) */
// v2 : ne met en cache QUE les fichiers statiques de l'app (même origine).
// Les données (Supabase, /api, images externes) passent TOUJOURS par le réseau.
const CACHE = "bdlib-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  // supprime les anciens caches (dont bdlib-v1 qui contenait des réponses Supabase périmées)
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // autre domaine (Supabase, BnF, Google, OpenLibrary…) : jamais de cache, réseau direct
  if (url.origin !== self.location.origin) return;
  // fonctions serverless : données live
  if (url.pathname.startsWith("/api/")) return;
  // navigation : réseau d'abord, cache seulement hors-ligne
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  // fichiers statiques versionnés (/assets/*-hash.js|css) + icônes : cache-first
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }))
    );
    return;
  }
  // le reste : réseau d'abord, cache en secours
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
