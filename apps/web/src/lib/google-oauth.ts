import { loadSupabase } from '@/lib/supabase';

const OAUTH_REMEMBER_KEY = 'ldh_oauth_remember';
const OAUTH_NEXT_KEY = 'ldh_oauth_next';

export { OAUTH_REMEMBER_KEY, OAUTH_NEXT_KEY };

export async function startGoogleLogin(opts?: { rememberMe?: boolean; next?: string | null }) {
  const supabase = await loadSupabase();
  if (!supabase) {
    throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — không mở được Google.');
  }
  if (opts?.rememberMe) sessionStorage.setItem(OAUTH_REMEMBER_KEY, '1');
  else sessionStorage.removeItem(OAUTH_REMEMBER_KEY);
  if (opts?.next) sessionStorage.setItem(OAUTH_NEXT_KEY, opts.next);
  else sessionStorage.removeItem(OAUTH_NEXT_KEY);

  const redirectTo = `${window.location.origin}/auth/oauth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: false },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Không nhận được URL đăng nhập Google');
}
