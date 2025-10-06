const CACHE_VERSION = 'counter-pwa-v1';
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './print.css',
  './print.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
].map(path => new URL(path, self.location.origin + BASE).pathname);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const fallbackUrl = new URL('./index.html', self.location.origin + BASE).pathname;
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => cached || caches.match(fallbackUrl));
      if (cached) {
        return cached;
      }
      return networkFetch;
    }).catch(() => caches.match(fallbackUrl))
  );
});
