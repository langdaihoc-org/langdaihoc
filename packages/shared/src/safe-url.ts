/**
 * Sanitize CMS / user-provided link & image URLs (banner, post, CTA).
 * Chỉ cho phép path nội bộ hoặc https (không javascript:/data:/v.v.).
 */

export function isSafeInternalPath(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const t = url.trim();
  if (!t.startsWith('/')) return false;
  if (t.startsWith('//')) return false;
  if (t.includes('\\') || t.includes('\0')) return false;
  try {
    const u = new URL(t, 'https://langdaihoc.local');
    return u.origin === 'https://langdaihoc.local' && u.pathname.startsWith('/');
  } catch {
    return false;
  }
}

export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Link CTA: path nội bộ `/...` hoặc URL http(s). */
export function isSafeLinkUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const t = url.trim();
  if (t.startsWith('/')) return isSafeInternalPath(t);
  return isSafeHttpsUrl(t);
}

export function sanitizeLinkUrl(url: string | null | undefined, fallback = '/'): string {
  if (!url?.trim()) return fallback;
  return isSafeLinkUrl(url) ? url.trim() : fallback;
}

export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return isSafeHttpsUrl(url) || isSafeInternalPath(url) ? url.trim() : null;
}
