/* langdaihoc PWA — install-only (không cache offline). */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Pass-through mạng — đủ điều kiện cài app trên Chromium, không lưu shell/API. */
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
