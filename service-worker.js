// ============================================================
// PAMIGO - Service Worker
// ============================================================
const CACHE_NAME = 'pamigo-v20260922';
const urlsToCache = [
  './',
  './index.html',
  './favicon.svg?v=20260922',
  './manifest.json?v=20260922',
  './css/base.css?v=20260922',
  './css/components.css?v=20260922',
  './css/layout.css?v=20260922'
];

self.addEventListener('install', (event) => {
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

  // متتجاهلش طلبات Supabase
  if (url.hostname.includes('supabase')) return;

  // JS files: جيبها من الشبكة على طول (متحفظهاش في الكاش)
  if (url.pathname.endsWith('.js')) return;

  if (request.method !== 'GET') return;

  // Network First
  event.respondWith(
    fetch(request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(request).then((response) => {
        if (response) return response;
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});