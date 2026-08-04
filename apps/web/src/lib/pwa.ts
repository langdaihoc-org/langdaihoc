import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'ldh_pwa_install_dismissed_until';
const DISMISS_MS = 24 * 60 * 60 * 1000; // 1 ngày

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || Boolean(iosStandalone);
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ báo MacIntel nhưng có touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Safari (không phải Chrome/Firefox/Edge trên iOS). */
export function isIosSafari(): boolean {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua)) return false;
  return /Safari/.test(ua) || !/(Chrome|Chromium|Firefox)/.test(ua);
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(DISMISS_KEY);
    return false;
  } catch {
    return false;
  }
}

export function dismissPwaInstallBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    /* ignore */
  }
}

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

export type PwaInstallMode = 'hidden' | 'android' | 'ios-safari' | 'ios-other';

export function usePwaInstall() {
  const [mode, setMode] = useState<PwaInstallMode>('hidden');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandaloneDisplay() || isDismissed()) {
      setMode('hidden');
      return;
    }

    if (isIosDevice()) {
      setMode(isIosSafari() ? 'ios-safari' : 'ios-other');
      return;
    }

    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
      setMode('android');
    };
    const onInstalled = () => {
      setDeferred(null);
      setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    dismissPwaInstallBanner();
    setMode('hidden');
    setDeferred(null);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        setMode('hidden');
        return true;
      }
      dismissPwaInstallBanner();
      setMode('hidden');
      return false;
    } catch {
      return false;
    }
  }, [deferred]);

  return { mode, dismiss, promptInstall, canPrompt: Boolean(deferred) };
}
