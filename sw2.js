const CACHE_NAME = 'mda-cache-v9';
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
  const url = new URL(e.request.url);

  // Cross-origin (Google APIs, Drive, Calendar, ecc.)
  // iOS WKWebView fix: il SW deve intercettare e ri-fetchare esplicitamente.
  // Problema v2.30: fetch(e.request) perdeva il body su iOS (stream consumato).
  // Fix v9: leggiamo il body con blob() prima di creare un nuovo fetch,
  // così il body è materializzato in memoria nel SW e non va perso.
  if (url.origin !== self.location.origin) {
    e.respondWith(
      (async () => {
        const method = e.request.method;
        // GET/HEAD: nessun body, passthrough diretto
        if (method === 'GET' || method === 'HEAD') {
          return fetch(e.request);
        }
        // POST/PATCH/PUT: leggi il body esplicitamente prima di ri-fetchare
        let bodyBlob = null;
        try { bodyBlob = await e.request.blob(); } catch(_) {}
        const headers = {};
        try { e.request.headers.forEach((v, k) => { headers[k] = v; }); } catch(_) {}
        return fetch(e.request.url, {
          method,
          headers,
          body: bodyBlob && bodyBlob.size > 0 ? bodyBlob : null
        });
      })()
    );
    return;
  }

  // mda-app.html: sempre dalla rete (con fallback cache)
  const p = url.pathname;
  if (p === '/mda-app/' || p.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Icone e manifest: dalla cache (con fallback rete)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
