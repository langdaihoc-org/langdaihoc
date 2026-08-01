/** Đăng ký service worker (chỉ production) — PWA install-only. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] service worker register failed', err);
    });
  });
}
