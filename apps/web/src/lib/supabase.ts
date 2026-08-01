import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY chưa được cấu hình — Realtime sẽ bị tắt');
}

/**
 * Supabase browser client — chỉ dùng cho Realtime subscribe.
 * Auth được xử lý bởi API server (cookie-based), không dùng Supabase Auth ở đây.
 */
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
}) : null;
