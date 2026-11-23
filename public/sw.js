const CACHE_NAME = 'omniqm-__OMNIQM_BUILD_ID__';
const PRECACHE_PATHS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_PATHS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
    }),
  );
  if (!self.registration || !self.registration.active) {
    self.skipWaiting();
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('omniqm-') && key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstHtml(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request.url, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (fresh && fresh.ok) {
      await cache.put('/index.html', fresh.clone());
    }
    return fresh;
  } catch {
    return (await cache.match('/index.html')) || (await cache.match(request)) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);

  const networkPromise = fetch(event.request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(event.request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => cached || Response.error());

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  return networkPromise;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  const acceptHeader = event.request.headers.get('accept') || '';
  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    acceptHeader.includes('text/html');

  if (isHtmlRequest) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});
