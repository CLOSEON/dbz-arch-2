// Dabzzo Service Worker — minimal shell
// Handles PWA install probe without blocking app functionality

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests — no offline caching in v1
  event.respondWith(fetch(event.request));
});
