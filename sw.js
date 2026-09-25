const CACHE_NAME = 'mda-cache-v5';
const STATIC = ['/mda-app/icon-192.png', '/mda-app/icon-512.png', '/mda-app/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const p = new URL(e.request.url).pathname;
  // mda-app.html e root: sempre dalla rete (aggiornamenti immediati)
  if (p === '/mda-app/' || p.endsWith('mda-app.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Icone e manifest: dalla cache
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
