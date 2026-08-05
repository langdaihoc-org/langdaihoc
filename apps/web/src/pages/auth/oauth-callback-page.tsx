import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Alert } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { loadSupabase } from '@/lib/supabase';
import { OAUTH_NEXT_KEY, OAUTH_REMEMBER_KEY } from '@/lib/google-oauth';

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refetch, setSessionUser } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error_description') || params.get('error');

      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (oauthError) {
        if (!cancelled) setError('Đăng nhập Google bị hủy hoặc thất bại.');
        return;
      }
      if (!code) {
        if (!cancelled) setError('Thiếu mã xác thực Google. Hãy thử đăng nhập lại.');
        return;
      }

      const supabase = await loadSupabase();
      if (!supabase) {
        if (!cancelled) {
          setError('Thiếu cấu hình Supabase trên web (VITE_SUPABASE_URL / ANON_KEY).');
        }
        return;
      }

      const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeErr || !data.session?.access_token || !data.session.refresh_token) {
        if (!cancelled) {
          setError(exchangeErr?.message || 'Không xác thực được với Google.');
        }
        return;
      }

      const rememberMe = sessionStorage.getItem(OAUTH_REMEMBER_KEY) === '1';
      const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
      sessionStorage.removeItem(OAUTH_REMEMBER_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);

      try {
        const result = await authApi.oauthSession({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          rememberMe,
        });
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

        if (cancelled) return;
        if (result.user) setSessionUser(result.user);
        await refetch();
        toast('Đăng nhập Google thành công', 'success');

        const dest =
          next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/auth')
            ? next
            : typeof result.redirectTo === 'string' &&
                result.redirectTo.startsWith('/') &&
                !result.redirectTo.startsWith('//')
              ? result.redirectTo
              : '/';
        navigate(dest, { replace: true });
      } catch (err) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Đăng nhập Google thất bại');
        }
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate, refetch, setSessionUser, toast]);

  if (error) {
    return (
      <AuthLayout title="Đăng nhập Google" subtitle="Không hoàn tất được">
        <Alert variant="error">{error}</Alert>
        <div className="mt-6">
          <Link to="/auth/login">
            <Button className="w-full">Về trang đăng nhập</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Đăng nhập Google" subtitle="Đang xác thực…">
      <Alert variant="info">Vui lòng chờ trong giây lát.</Alert>
    </AuthLayout>
  );
}
