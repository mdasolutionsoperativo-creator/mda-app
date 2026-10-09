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

  // ── Cross-origin (Google APIs, Drive, Calendar, ecc.) ─────────────────────
  // iOS WKWebView dual-stream bug:
  //   Bug 1 (REQUEST): il body stream di e.request viene perso → materializzare con blob()
  //   Bug 2 (RESPONSE): il ReadableStream esterno (da googleapis.com) non viene consegnato
  //                     al thread principale → leggere il body nel SW e creare new Response
  //                     locale con Blob materializzato, così iOS può consegnarlo senza problemi
  if (url.origin !== self.location.origin) {
    e.respondWith(
      (async () => {
        const method = e.request.method;

        // GET/HEAD: nessun body di richiesta, nessun rischio body-stream
        if (method === 'GET' || method === 'HEAD') {
          try {
            const resp = await fetch(e.request);
            // Materializza anche la risposta per sicurezza su iOS
            const body = await resp.blob();
            return new Response(body, {
              status: resp.status,
              headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/octet-stream' }
            });
          } catch(_) { return fetch(e.request); }
        }

        // POST/PATCH/PUT: doppia materializzazione (request body + response body)
        let reqBody = null;
        try { reqBody = await e.request.blob(); } catch(_) {}

        const reqHeaders = {};
        try { e.request.headers.forEach((v, k) => { reqHeaders[k] = v; }); } catch(_) {}

        // Chiamata reale dalla SW context (bypassa le restrizioni CORS di WKWebView)
        const resp = await fetch(e.request.url, {
          method,
          headers: reqHeaders,
          body: reqBody && reqBody.size > 0 ? reqBody : null
        });

        // Materializza la RISPOSTA in un Blob nel SW, poi crea una nuova Response locale.
        // Se tornassimo resp direttamente, iOS WKWebView non riesce a leggere lo stream
        // esterno nel thread principale → fetch() lancia "Load failed" anche se la richiesta
        // è arrivata e Google ha risposto correttamente.
        const respBody = await resp.blob();
        return new Response(respBody, {
          status: resp.status,
          headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/json' }
        });
      })()
    );
    return;
  }

  // ── Same-origin ────────────────────────────────────────────────────────────
  const p = url.pathname;
  if (p === '/mda-app/' || p.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
