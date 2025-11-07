// тест
const CACHE_NAME = 'crocomim-static-v5';
const DICTS_CACHE = 'crocomim-dicts-runtime-v2';
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/app.js',
  './scripts/feedback.js',
  './scripts/dicts.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

const isSameOrigin = request => request.url.startsWith(self.location.origin);
const isDictRequest = request => {
  if (!isSameOrigin(request)) {
    return false;
  }
  const url = new URL(request.url);
  return url.pathname.startsWith('/dicts/');
};

const networkFirstDict = async request => {
  try {
    const response = await fetch(request);
    const copy = response.clone();
    const cache = await caches.open(DICTS_CACHE);
    await cache.put(request, copy);
    return response;
  } catch (error) {
    const cache = await caches.open(DICTS_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
};

const cacheFirstStatic = async request => {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
};

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  if (isDictRequest(request)) {
    event.respondWith(
      networkFirstDict(request).catch(() => Response.error())
    );
    return;
  }

  if (isSameOrigin(request)) {
    event.respondWith(
      cacheFirstStatic(request).catch(() => Response.error())
    );
  }
});
