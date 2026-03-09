// ============================================================
//  sw.js – Service Worker | Bonequinhas da Dani
//  Cache versionado + estratégia Network-first para API,
//  Cache-first para assets estáticos.
// ============================================================

const CACHE_VERSION  = 'v1.0.1';
const STATIC_CACHE   = `bonequinhas-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE  = `bonequinhas-dynamic-${CACHE_VERSION}`;

// Assets que serão pré-cacheados na instalação do SW
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icon-192.png',
  // './icon-512.png', // REMOVIDO: arquivo não existe no repositório
];

// ──────────────────────────────────────────────
//  INSTALL – pré-cacheia assets estáticos
// ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Tenta adicionar cada asset individualmente para evitar que um erro 404 quebre todo o cache
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Falha ao cachear asset: ${asset}`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// ──────────────────────────────────────────────
//  ACTIVATE – remove caches antigos
// ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ──────────────────────────────────────────────
//  FETCH – estratégia híbrida
// ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET e chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Supabase API e Storage → Network-first (sem cache)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Sem conexão com o servidor.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Assets estáticos → Cache-first
  if (STATIC_ASSETS.some((asset) => request.url.endsWith(asset.replace('./', '')))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndCache(request, STATIC_CACHE))
    );
    return;
  }

  // Demais requisições → Network-first com fallback para cache dinâmico
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ──────────────────────────────────────────────
//  Utilitário: busca e armazena no cache
// ──────────────────────────────────────────────
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return caches.match(request);
  }
}
