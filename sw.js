// Service worker: makes the game installable and playable offline.
// The whole game is one big index.html, so we cache the app shell and serve it
// cache-first. Leaderboard requests (workers.dev) always go to the network.
const CACHE = 'pz-merkaz-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  let url;
  try { url = new URL(e.request.url); } catch { return; }
  if (url.hostname.includes('workers.dev')) return;          // leaderboard: always live network
  if (url.origin !== location.origin) return;                // let cross-origin go straight to network
  // stale-while-revalidate: serve cache instantly, refresh it in the background so
  // the NEXT launch always has the latest deploy (updates never get stuck)
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || net;
    })
  );
});
