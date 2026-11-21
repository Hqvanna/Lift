/* Lift — Service-Worker (§1.3, §32.1)
   Network-first für HTML/CSS/JS, Cache-first für Bilder/Icons.
   Cache-Name versioniert; skipWaiting() + clients.claim() sofort. */
'use strict';

const CACHE = 'lift-cache-v11';
const BUILD = '9';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=' + BUILD,
  './js/analysis.js?v=' + BUILD,
  './js/data.js?v=' + BUILD,
  './js/store.js?v=' + BUILD,
  './js/ui.js?v=' + BUILD,
  './js/training.js?v=' + BUILD,
  './js/progress.js?v=' + BUILD,
  './js/mobility.js?v=' + BUILD,
  './js/app.js?v=' + BUILD,
  './js/more.js?v=' + BUILD,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isImage(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Cache-first für Bilder/Icons */
  if (isImage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  /* Network-first für HTML/CSS/JS und alles Übrige */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      /* Der Host liefert JS/CSS mit max-age=14400 aus — deshalb den
         HTTP-Cache des Browsers hier bewusst umgehen. */
      const res = await fetch(new Request(req.url, {
        cache: 'reload', credentials: 'same-origin', mode: 'same-origin'
      })).catch(() => fetch(req));
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      return new Response('Offline', { status: 504, statusText: 'Offline' });
    }
  })());
});
