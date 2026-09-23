// ============================================================
// PAMIGO - Service Worker
// ============================================================
const CACHE_NAME = 'pamigo-v1';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('⚠️ Cache addAll error:', err);
      });
    })
  );
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

  // ✅ متتجاهلش طلبات Supabase
  if (url.hostname.includes('supabase')) return;

  // ✅ متتجاهلش طلبات esm.sh و CDN
  if (url.hostname.includes('esm.sh') ||
      url.hostname.includes('cdnjs') ||
      url.hostname.includes('unpkg') ||
      url.hostname.includes('fonts.googleapis') ||
      url.hostname.includes('fonts.gstatic')) return;

  // ✅ JS files: جيبها من الشبكة على طول
  if (url.pathname.endsWith('.js')) return;

  if (request.method !== 'GET') return;

  // ✅ Network First مع Fallback للكاش
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