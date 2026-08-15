/*
 * langdaihoc PWA service worker.
 *
 * Nguyên tắc: chỉ đụng vào tài sản tĩnh của chính origin này.
 *  - /assets/*  : tên file đã gắn hash nội dung nên không bao giờ đổi ruột
 *                 → cache-first, lần vào sau gần như không tốn byte nào.
 *  - icon/logo  : cùng cách, nhưng có revalidate nền vì tên file không đổi khi sửa ảnh.
 *  - điều hướng : network-first, rơi về bản cache khi mạng chập chờn (4G trong KTX).
 *  - còn lại    : KHÔNG đụng. Đặc biệt là /api/* — dữ liệu riêng từng người, khác origin,
 *                 lọt vào cache là rò rỉ đơn hàng giữa các tài khoản dùng chung máy.
 */

const VERSION = 'v2';
const ASSET_CACHE = `ldh-assets-${VERSION}`;
const SHELL_CACHE = `ldh-shell-${VERSION}`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('ldh-') && k !== ASSET_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Tài sản build có hash trong tên — đổi nội dung là đổi URL. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** Ảnh tĩnh giữ nguyên tên khi sửa → phải revalidate nền. */
function isStaticImage(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/langdaihoc-logo-mark.png' ||
    url.pathname === '/favicon-48.png' ||
    url.pathname === '/favicon.svg'
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res.ok && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit ?? fetching;
}

async function navigationHandler(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(SHELL_URL, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Khác origin (API Railway, Supabase Storage, R2) — để trình duyệt tự lo.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (isStaticImage(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
  // Mọi thứ khác: không gọi respondWith → request đi thẳng, không qua SW.
});
