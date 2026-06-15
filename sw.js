/* sw.js — Hero Legends Thai service worker.
 * Strategy: NETWORK-FIRST (revalidate) for same-origin GETs → always fresh when
 * online (kills the "stale cached JS, must hard-refresh" problem), with a CACHE
 * FALLBACK so the game still loads offline. Images fall back to cache fast too.
 */
const CACHE = 'hlt-v1';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;        // only same-origin assets

  e.respondWith((async () => {
    try {
      // always revalidate against the server → fresh JS/HTML/images when online
      const fresh = await fetch(req, { cache: 'no-cache' });
      if (fresh && (fresh.ok || fresh.type === 'opaqueredirect')) {
        try { (await caches.open(CACHE)).put(req, fresh.clone()); } catch (_) {}
      }
      return fresh;
    } catch (err) {
      // offline → serve whatever we cached
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const idx = (await caches.match('index.html')) || (await caches.match('./'));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
