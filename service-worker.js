// ============================================================
// PAMIGO - Service Worker (v2)
// ============================================================
const CACHE_NAME = 'pamigo-v2';
const urlsToCache = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/layout.css'
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

  // متتجاهلش طلبات Supabase (لازم إنترنت دايمًا)
  if (url.hostname.includes('supabase')) return;

  // متتجاهلش طلبات غير GET
  if (request.method !== 'GET') return;

  // Network First - يجيب النسخة الجديدة دايمًا
  event.respondWith(
    fetch(request).then((networkResponse) => {
      // خزّن نسخة من الرد الجديد
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      // لو مفيش نت، رجّع من الكاش
      return caches.match(request).then((response) => {
        if (response) return response;
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
