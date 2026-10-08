// Service worker: makes the game installable and playable offline.
// Navigation checks for the latest app; cached assets keep offline play quick.
// Leaderboard requests (workers.dev) always go to the network.
const CACHE = 'pz-merkaz-v141';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

// ⚠️ c.add משתמש במטמון ה-HTTP, ולכן בזמן שה-CDN עוד מפיץ גרסה חדשה אפשר
// לשמור גוף **ישן** תחת שם המטמון החדש — נצפה בפועל: הדף המשיך להגיש גרף
// כבישים ישן אחרי פריסה. fetch עם cache:'reload' עוקף את המטמון ומקטין
// את החלון הזה. (ה-stale-while-revalidate למטה מרפא ממילא בטעינה הבאה.)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map(async (u) => {
        const resp = await fetch(new Request(u, { cache: 'reload' }));
        if (resp && resp.status === 200) await c.put(u, resp);
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('pz-merkaz-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  let url;
  try { url = new URL(e.request.url); } catch { return; }
  if (url.hostname.includes('workers.dev')) return;          // leaderboard: always live network
  if (url.origin !== location.origin) return;                // let cross-origin go straight to network
  const navigation = e.request.mode === 'navigate';
  const net = fetch(e.request, navigation ? {cache:'no-cache'} : undefined);
  // Keep the worker alive until the cache write finishes, even when a cached
  // response was returned immediately. Otherwise offline model files vanish.
  e.waitUntil(net.then(async (resp) => {
    if(resp && resp.status === 200){
      const clone=resp.clone(),cache=await caches.open(CACHE);
      await cache.put(e.request,clone);
    }
  }).catch(()=>{}));
  if(navigation){
    e.respondWith((async()=>{
      let timer;
      const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);});
      const response=await Promise.race([net.catch(()=>null),timeout]);clearTimeout(timer);
      if(response?.ok)return response;
      return await caches.match(e.request)||await caches.match('./index.html')||response||new Response('המשחק אינו זמין כרגע ללא חיבור', {status:503});
    })());
  }else{
    // A failed image/model request must not return index.html with status 200.
    e.respondWith(caches.match(e.request).then(hit=>hit||net.catch(()=>new Response('',{status:503}))));
  }
});
