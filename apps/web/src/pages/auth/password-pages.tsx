import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, resetPasswordSchema } from '@langdaihoc/shared';
import { AuthLayout, AuthFooterLinks, SubmitRow } from '@/components/layout/auth-layout';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { authApi, ApiError } from '@/lib/api';
import { loadSupabase } from '@/lib/supabase';

export function ForgotPasswordPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [accountExists, setAccountExists] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await authApi.forgotPassword(data);
      setMessage(result.message);
      setAccountExists(result.accountExists !== false);
      toast(result.message, result.accountExists === false ? 'info' : 'success');
    } catch (err) {
      const fallback =
        err instanceof ApiError
          ? err.message
          : 'Không gửi được hướng dẫn. Vui lòng thử lại sau.';
      setMessage(fallback);
      setAccountExists(null);
      toast(fallback, 'error');
    }
  });

  return (
    <AuthLayout
      title="Khôi phục tài khoản"
      subtitle="Nhập email hoặc SĐT — hướng dẫn đặt lại mật khẩu sẽ gửi qua email đăng ký"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {message && (
          <Alert variant={accountExists === false ? 'warning' : accountExists ? 'success' : 'error'}>
            {message}
          </Alert>
        )}
        <Input
          label="Email hoặc số điện thoại"
          type="text"
          autoComplete="username"
          placeholder="email@example.com hoặc 090..."
          error={errors.identifier?.message as string | undefined}
          {...register('identifier')}
        />
        <SubmitRow loading={isSubmitting} label="Gửi hướng dẫn qua email" />
      </form>
      <AuthFooterLinks links={[{ to: '/auth/login', label: 'Quay lại đăng nhập' }]} />
    </AuthLayout>
  );
}

const RESET_SESSION_KEY = 'ldh_reset_session';
const RESET_SESSION_TTL_MS = 15 * 60 * 1000;
/** Dedup verify khi React StrictMode mount 2 lần (token chỉ dùng 1 lần). */
const recoveryVerifyInflight = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>();

function readCachedResetSession(
  tokenKey: string,
): { accessToken: string; refreshToken: string } | null {
  try {
    const raw = sessionStorage.getItem(RESET_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      accessToken?: string;
      refreshToken?: string;
      at?: number;
      tokenKey?: string;
    };
    if (
      !parsed.accessToken ||
      !parsed.at ||
      !parsed.tokenKey ||
      parsed.tokenKey !== tokenKey ||
      Date.now() - parsed.at > RESET_SESSION_TTL_MS
    ) {
      sessionStorage.removeItem(RESET_SESSION_KEY);
      return null;
    }
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken ?? '' };
  } catch {
    return null;
  }
}

function cacheResetSession(tokenKey: string, accessToken: string, refreshToken: string) {
  try {
    sessionStorage.setItem(
      RESET_SESSION_KEY,
      JSON.stringify({ tokenKey, accessToken, refreshToken, at: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

function clearCachedResetSession() {
  try {
    sessionStorage.removeItem(RESET_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(window.location.search);
      const tokenHash = queryParams.get('token_hash');
      const code = queryParams.get('code');
      const tokenKey = tokenHash
        ? `hash:${tokenHash}`
        : code
          ? `code:${code}`
          : hashParams.get('access_token')
            ? `access:${hashParams.get('access_token')}`
            : '';

      if (tokenKey) {
        const cached = readCachedResetSession(tokenKey);
        if (cached) {
          if (!cancelled) {
            setTokens(cached);
            setBooting(false);
          }
          window.history.replaceState(
            null,
            '',
            window.location.pathname.replace(/\/auth\/reset_password$/i, '/auth/reset-password'),
          );
          return;
        }
      }

      const authError =
        hashParams.get('error_description') ||
        hashParams.get('error') ||
        queryParams.get('error_description') ||
        queryParams.get('error');

      if (authError) {
        if (!cancelled) {
          setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
          setBooting(false);
        }
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }

      let accessToken = hashParams.get('access_token') ?? '';
      let refreshToken = hashParams.get('refresh_token') ?? '';

      // Link Resend: ?token_hash=&type=recovery — verify qua API (không phụ thuộc VITE_SUPABASE_*).
      const rawType = queryParams.get('type') ?? 'recovery';
      const otpType =
        rawType === 'recovery' ||
        rawType === 'magiclink' ||
        rawType === 'signup' ||
        rawType === 'email'
          ? rawType
          : 'recovery';
      if (!accessToken && tokenHash) {
        const cacheKey = `${otpType}:${tokenHash}`;
        let pending = recoveryVerifyInflight.get(cacheKey);
        if (!pending) {
          pending = authApi
            .verifyRecovery({
              tokenHash,
              type: otpType,
            })
            .then((result) => ({
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
            }))
            .finally(() => {
              recoveryVerifyInflight.delete(cacheKey);
            });
          recoveryVerifyInflight.set(cacheKey, pending);
        }
        try {
          const result = await pending;
          accessToken = result.accessToken;
          refreshToken = result.refreshToken;
        } catch (err) {
          console.error(
            '[reset-password] verify-recovery failed',
            err instanceof ApiError ? err.message : err,
          );
        }
      }

      // Fallback cũ: PKCE ?code= (lazy-load client Supabase browser).
      if (!accessToken && code) {
        const supabase = await loadSupabase();
        if (supabase) {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeErr && data.session) {
            accessToken = data.session.access_token;
            refreshToken = data.session.refresh_token;
          }
        }
      }

      if (accessToken && tokenKey) {
        cacheResetSession(tokenKey, accessToken, refreshToken);
      }

      if (window.location.hash || window.location.search) {
        // Chuẩn hóa underscore → hyphen khi xóa query khỏi URL.
        const path = window.location.pathname.replace(/\/auth\/reset_password$/i, '/auth/reset-password');
        window.history.replaceState(null, '', path);
      }

      if (cancelled) return;
      if (!accessToken) {
        setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');
        setBooting(false);
        return;
      }
      setTokens({ accessToken, refreshToken });
      setBooting(false);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    if (!tokens?.accessToken) return;
    setError('');
    try {
      const result = await authApi.resetPassword({
        ...data,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      clearCachedResetSession();
      setMessage(result.message);
      toast(result.message, 'success');
      navigate('/auth/login?reset=1', {
        replace: true,
        state: { authNotice: result.message },
      });
    } catch {
      setError('Liên kết không hợp lệ hoặc đã hết hạn');
    }
  });

  if (booting) {
    return (
      <AuthLayout title="Đặt lại mật khẩu" subtitle="Đang kiểm tra liên kết…">
        <Alert variant="info">Vui lòng chờ trong giây lát.</Alert>
      </AuthLayout>
    );
  }

  if (!tokens?.accessToken) {
    return (
      <AuthLayout title="Đặt lại mật khẩu">
        <Alert variant="error">{error || 'Liên kết đặt lại mật khẩu không hợp lệ.'}</Alert>
        <Link to="/auth/forgot-password" className="mt-4 block text-center text-brand-orange-dark">
          Yêu cầu liên kết mới
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản">
      <form onSubmit={onSubmit} className="space-y-4">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Mật khẩu mới"
          type="password"
          error={errors.password?.message as string | undefined}
          {...register('password')}
        />
        <Input
          label="Xác nhận mật khẩu"
          type="password"
          error={errors.confirmPassword?.message as string | undefined}
          {...register('confirmPassword')}
        />
        <SubmitRow loading={isSubmitting} label="Lưu mật khẩu mới" />
      </form>
      {message && (
        <Link to="/auth/login" className="mt-4 block text-center text-sm font-semibold text-brand-orange-dark">
          Đăng nhập lại
        </Link>
      )}
    </AuthLayout>
  );
}
