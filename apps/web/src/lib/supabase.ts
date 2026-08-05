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
let oauthClientPromise: Promise<SupabaseClient | null> | null = null;

const OAUTH_STORAGE_KEY = 'ldh-oauth-auth';

/**
 * Lazy-load Supabase browser client (Realtime).
 * Phiên app gắn cookie qua API — không persist Auth session.
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
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: { params: { eventsPerSecond: 10 } },
      });
    })();
  }
  return clientPromise;
}

/**
 * Client riêng cho Google OAuth PKCE.
 * Phải dùng sessionStorage — persistSession:false mất code_verifier sau redirect Google.
 */
export function loadSupabaseOAuth(): Promise<SupabaseClient | null> {
  if (!oauthClientPromise) {
    oauthClientPromise = (async () => {
      if (!url || !key) {
        console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY chưa hợp lệ — OAuth tắt');
        return null;
      }
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(url, key, {
        auth: {
          persistSession: true,
          storage: window.sessionStorage,
          storageKey: OAUTH_STORAGE_KEY,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      });
    })();
  }
  return oauthClientPromise;
}

/**
 * Xóa session OAuth khỏi sessionStorage.
 * Không dùng supabase.auth.signOut() — nó gọi /logout và thu hồi session trên
 * Supabase, làm access token vừa gắn vào cookie API trở nên vô hiệu.
 */
export function clearOAuthStorage() {
  try {
    window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);
  } catch {
    // sessionStorage bị chặn — bỏ qua
  }
}

/** @deprecated Dùng loadSupabase() — giữ alias để tránh import sync nặng. */
export const supabase: null = null;
