const CACHE_NAME = 'mda-cache-v10';
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

  // Cross-origin (Calendar, GIS, ecc.) — passthrough con clone() per preservare il body.
  // Le chiamate Drive API vengono gestite separatamente tramite DRIVE_FETCH postMessage
  // per evitare il bug WKWebView di consegna della risposta al thread principale.
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request.clone()));
    return;
  }

  // Same-origin: html sempre dalla rete, static cache-first
  const p = url.pathname;
  if (p === '/mda-app/' || p.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// ── DRIVE_FETCH via postMessage ────────────────────────────────────────────────
// Su iOS WKWebView, la risposta di un fetch cross-origin non può essere consegnata
// in modo affidabile al thread principale tramite il fetch event (bug WKWebView).
// Soluzione: l'app invia DRIVE_FETCH tramite postMessage; il SW effettua il vero
// fetch direttamente dalla propria sandbox (non soggetto alle restrizioni WKWebView)
// e risponde con DRIVE_FETCH_RESULT via postMessage.
self.addEventListener('message', async e => {
  if (e.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  if (e.data?.type !== 'DRIVE_FETCH') return;

  const { reqId, url, method, headers, body, bodyType } = e.data;
  try {
    let fetchBody = null;
    if (body instanceof ArrayBuffer && body.byteLength > 0) {
      fetchBody = new Blob([body], { type: bodyType || 'application/octet-stream' });
    }
    const resp = await fetch(url, { method, headers, body: fetchBody });
    const ok = resp.ok;
    const status = resp.status;
    const text = await resp.text();
    if (e.source) e.source.postMessage({ type: 'DRIVE_FETCH_RESULT', reqId, ok, status, text });
  } catch(err) {
    if (e.source) e.source.postMessage({
      type: 'DRIVE_FETCH_RESULT', reqId, ok: false, status: 0,
      error: (err && err.message) || 'network error'
    });
  }
});
