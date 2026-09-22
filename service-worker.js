// ============================================================
// PAMIGO - Service Worker
// ============================================================
const CACHE_NAME = 'pamigo-v1';
const urlsToCache = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.json',
  './config.js',
  './supabase.js',
  './app.js',
  './auth.js',
  './i18n.js',
  './ui.js',
  './ratings.js',
  './requests.js',
  './invoices.js',
  './dashboard.js',
  './admin.js',
  './account.js',
  './theme.js',
  './css/base.css',
  './css/components.css',
  './css/layout.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app shell');
        return cache.addAll(urlsToCache.map(url => new Request(url, { credentials: 'same-origin' })));
      })
      .catch((err) => {
        console.log('⚠️ Cache failed (مفيش مشكلة):', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.hostname.includes('supabase')) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) return response;
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});