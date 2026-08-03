import type { SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const url = isHttpUrl(rawUrl) ? rawUrl : undefined;

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Lazy-load Supabase browser client (Realtime only).
 * Auth cookie-based qua API — không kéo @supabase/supabase-js vào bundle trang chủ.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      if (!url || !key) {
        console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY chưa hợp lệ — Realtime tắt');
        return null;
      }
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });
    })();
  }
  return clientPromise;
}

/** @deprecated Dùng loadSupabase() — giữ alias để tránh import sync nặng. */
export const supabase: null = null;
