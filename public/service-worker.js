// тест
const CACHE_NAME = 'crocomim-static-v8';
const DICTS_CACHE = 'crocomim-dicts-runtime-v3';
const DICTS_INDEX_PATH = './dicts/index.json';
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/app.js',
  './scripts/feedback.js',
  './scripts/dicts.js',
  DICTS_INDEX_PATH,
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await Promise.allSettled([
      caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)),
      precacheDictionaries()
    ]);
    self.skipWaiting();
  })());
});

const ALLOWED_CACHES = new Set([CACHE_NAME, DICTS_CACHE]);

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(key => !ALLOWED_CACHES.has(key))
        .map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
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

const cacheFirstDict = async request => {
  const cache = await caches.open(DICTS_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    await cache.put(request, response.clone());
    return response;
  } catch (error) {
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
      cacheFirstDict(request).catch(() => Response.error())
    );
    return;
  }

  if (isSameOrigin(request)) {
    event.respondWith(
      cacheFirstStatic(request).catch(() => Response.error())
    );
  }
});

async function precacheDictionaries(){
  try {
    const response = await fetch(DICTS_INDEX_PATH, { cache: 'no-cache' });
    if (!response.ok) return;

    const data = await response.json().catch(() => null);
    const list = Array.isArray(data?.dictionaries) ? data.dictionaries : [];
    const paths = new Set([DICTS_INDEX_PATH]);

    list.forEach(dict => {
      if (!dict || typeof dict !== 'object') return;
      const diffs = dict.difficulties && typeof dict.difficulties === 'object' ? dict.difficulties : {};
      Object.values(diffs).forEach(info => {
        const path = typeof info?.path === 'string' && info.path.trim() ? info.path.trim() : '';
        if (path) {
          paths.add(`./dicts/${path}`);
        }
      });
    });

    if (!paths.size) return;

    const cache = await caches.open(DICTS_CACHE);
    await cache.addAll(Array.from(paths));
  } catch (error) {
    console.warn('[CrocoMim] Не удалось предзагрузить словари для офлайн-режима', error);
  }
}
