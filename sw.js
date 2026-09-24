// ================================
// PAMIGO - Service Worker
// ================================

const CACHE_NAME = 'pamigo-v1';

// الملفات اللي هنخزنها في الكاش
const urlsToCache = [
  './',
  './index.html',
  './site.webmanifest', // تم التعديل عشان يطابق اسم ملفك
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
  './supabase.js',
  './ui.js',
  './web-app-manifest-192x192.png',
  './web-app-manifest-512x512.png'
];

// حدث التثبيت (Install)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Opening cache...');
      // بنستخدم catch عشان لو ملف واحد مش موجود، العملية كلها متفشلش
      return cache.addAll(urlsToCache).catch((error) => {
        console.error('⚠️ Cache addAll error:', error);
      });
    })
  );
});

// حدث التنشيط (Activate)
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
    }).then(() => self.clients.claim())
  );
});

// حدث الجلب (Fetch) - مهم جداً عشان المتصفح يسمح بالتثبيت
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // لو الملف موجود في الكاش، رجعه
      if (response) {
        return response;
      }
      // لو مش موجود، هاته من النت
      return fetch(event.request).catch(() => {
        // لو مفيش نت وملف مش موجود، ممكن ترجع صفحة offline هنا لو حبيت
        console.log('❌ Fetch failed for:', event.request.url);
      });
    })
  );
});
