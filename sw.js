// ================================
// PAMIGO - Service Worker v5 (With Push Notifications)
// ================================

const CACHE_VERSION = Date.now().toString();
const CACHE_NAME = `pamigo-${CACHE_VERSION}`;

const urlsToCache = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.ico',
  './favicon.svg',
  './favicon-96x96.png',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './app.js',
  './config.js',
  './auth.js',
  './account.js',
  './admin.js',
  './dashboard.js',
  './i18n.js',
  './invoices.js',
  './ratings.js',
  './requests.js',
  './notifications.js',
  './supabase.js',
  './ui.js',
  './web-app-manifest-192x192.png',
  './web-app-manifest-512x512.png'
];

// ================================
// Install
// ================================
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((error) => {
        console.error('⚠️ Cache addAll error:', error);
      });
    })
  );
});

// ================================
// Activate
// ================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ================================
// Fetch
// ================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Supabase API — دايماً من الشبكة
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. خدمات خارجية — دايماً من الشبكة
  if (
    url.hostname.includes('nominatim') ||
    url.hostname.includes('arcgis') ||
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic') ||
    url.hostname.includes('cdnjs') ||
    url.hostname.includes('unpkg') ||
    url.hostname.includes('esm.sh')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. HTML / JS / CSS — Network-First
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((r) => {
            return r || new Response('Offline', { status: 503, statusText: 'Offline' });
          });
        })
    );
    return;
  }

  // 4. الصور والملفات الثابتة — Cache-First
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;

      return fetch(event.request)
        .then((res) => {
          const responseClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return res;
        })
        .catch(() => {
          return new Response('Not found', { status: 404, statusText: 'Not Found' });
        });
    })
  );
});

// ================================
// Push Notifications 🚀
// ================================
self.addEventListener('push', function(event) {
  if (event.data) {
    let data = {};
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'PAMIGO', body: event.data.text() };
    }

    const options = {
      body: data.body || 'عندك إشعار جديد!',
      icon: data.icon || 'https://ui-avatars.com/api/?name=P&background=ff6b35&color=fff&size=128',
      badge: 'https://ui-avatars.com/api/?name=P&background=ff6b35&color=fff&size=128',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'PAMIGO', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // لو الموقع مفتوح في تاب، ركز عليه
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // لو مقفول، افتحه
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
