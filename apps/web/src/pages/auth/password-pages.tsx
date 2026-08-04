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
      toast(result.message, 'success');
    } catch (err) {
      const fallback =
        err instanceof ApiError
          ? err.message
          : 'Không gửi được hướng dẫn. Vui lòng thử lại sau.';
      setMessage(fallback);
      toast(fallback, 'error');
    }
  });

  return (
    <AuthLayout
      title="Khôi phục tài khoản"
      subtitle="Nhập email hoặc SĐT — hướng dẫn đặt lại mật khẩu sẽ gửi qua email đăng ký"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {message && <Alert variant="success">{message}</Alert>}
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

/** Dedup verify khi React StrictMode mount 2 lần (token chỉ dùng 1 lần). */
const recoveryVerifyInflight = new Map<string, Promise<boolean>>();

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(window.location.search);
      const tokenHash = queryParams.get('token_hash');
      const code = queryParams.get('code');

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

      let ok = false;

      // Link Resend: ?token_hash=&type=recovery — verify qua API, session nằm httpOnly cookie.
      if (tokenHash) {
        const cacheKey = `recovery:${tokenHash}`;
        let pending = recoveryVerifyInflight.get(cacheKey);
        if (!pending) {
          pending = authApi
            .verifyRecovery({ tokenHash, type: 'recovery' })
            .then(() => true)
            .finally(() => {
              recoveryVerifyInflight.delete(cacheKey);
            });
          recoveryVerifyInflight.set(cacheKey, pending);
        }
        try {
          ok = await pending;
        } catch (err) {
          console.error(
            '[reset-password] verify-recovery failed',
            err instanceof ApiError ? err.message : err,
          );
        }
      }

      // Fallback cũ: PKCE ?code= — chỉ dùng khi chưa có token_hash.
      if (!ok && code) {
        const supabase = await loadSupabase();
        if (supabase) {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          ok = !exchangeErr && Boolean(data.session);
        }
      }

      if (window.location.hash || window.location.search) {
        const path = window.location.pathname.replace(/\/auth\/reset_password$/i, '/auth/reset-password');
        window.history.replaceState(null, '', path);
      }

      if (cancelled) return;
      if (!ok) {
        setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');
        setBooting(false);
        return;
      }
      setReady(true);
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
    if (!ready) return;
    setError('');
    try {
      const result = await authApi.resetPassword(data);
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

  if (!ready) {
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
        <SubmitRow loading={isSubmitting} label="Đặt lại mật khẩu" />
      </form>
    </AuthLayout>
  );
}
