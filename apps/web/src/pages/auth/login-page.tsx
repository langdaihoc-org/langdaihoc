import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@langdaihoc/shared';
import { AuthLayout, AuthFooterLinks, SubmitRow } from '@/components/layout/auth-layout';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

type AuthLocationState = {
  from?: { pathname?: string; search?: string };
  authNotice?: string;
  registeredEmail?: string;
} | null;

function initialAuthInfo(search: string, state: AuthLocationState) {
  if (state?.authNotice) return state.authNotice;
  if (new URLSearchParams(search).get('verified') === '1') {
    return 'Email đã được xác minh. Vui lòng đăng nhập để tiếp tục.';
  }
  if (new URLSearchParams(search).get('reset') === '1') {
    return 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.';
  }
  return '';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { refetch, setSessionUser } = useAuth();
  const locationState = location.state as AuthLocationState;
  const [error, setError] = useState('');
  const [info, setInfo] = useState(() => initialAuthInfo(location.search, locationState));
  const [needsVerify, setNeedsVerify] = useState(false);
  const [emailForResend, setEmailForResend] = useState(locationState?.registeredEmail ?? '');
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('verified') === '1' && !locationState?.authNotice) {
      toast('Xác thực email thành công. Vui lòng đăng nhập.', 'success');
    }
  }, [location.search, locationState?.authNotice, toast]);

  const afterLoginPath = () => {
    const from = locationState?.from;
    const path = from?.pathname;
    if (path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth')) {
      return `${path}${from?.search ?? ''}`;
    }
    return null;
  };

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: locationState?.registeredEmail ?? '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setError('');
    setNeedsVerify(false);
    try {
      const result = await authApi.login(data);
      if (result.user) setSessionUser(result.user);
      await refetch();

      if (result.requiresEmailVerification) {
        setNeedsVerify(true);
        setEmailForResend(getValues('identifier') ?? '');
        return;
      }

      toast('Đăng nhập thành công', 'success');
      const dest = afterLoginPath() ?? (typeof result.redirectTo === 'string' && result.redirectTo.startsWith('/') && !result.redirectTo.startsWith('//')
        ? result.redirectTo
        : '/');
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          setNeedsVerify(true);
          setEmailForResend(getValues('identifier') ?? '');
        }
        setError(err.message);
      } else {
        setError('Đăng nhập thất bại');
      }
    }
  });

  const resendVerification = async () => {
    const id = (emailForResend || getValues('identifier') || '').trim();
    if (!id) {
      setInfo('Nhập email hoặc số điện thoại để gửi lại xác minh.');
      return;
    }
    try {
      await authApi.resendVerification(id);
      setInfo('Email xác minh đã được gửi lại. Vui lòng kiểm tra hộp thư.');
      toast('Đã gửi lại email xác minh', 'success');
    } catch {
      setInfo('Nếu tài khoản tồn tại, email xác minh đã được gửi lại.');
    }
  };

  const onGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const { startGoogleLogin } = await import('@/lib/google-oauth');
      await startGoogleLogin({
        rememberMe: Boolean(getValues('rememberMe')),
        next: afterLoginPath(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không mở được đăng nhập Google');
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout title="Đăng nhập" subtitle="Dùng email / số điện thoại đã đăng ký hoặc Google">
      <form onSubmit={onSubmit} className="space-y-4">
        {info && <Alert variant="success">{info}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {needsVerify && (
          <Alert variant="warning">
            Tài khoản chưa xác minh email.{' '}
            <button type="button" onClick={resendVerification} className="font-semibold underline">
              Gửi lại email xác minh
            </button>
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
        <Input
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message as string | undefined}
          {...register('password')}
        />

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" {...register('rememberMe')} className="rounded" />
          Ghi nhớ đăng nhập
        </label>

        <SubmitRow loading={isSubmitting} label="Đăng nhập" />
      </form>

      <div className="relative my-4 text-center text-xs font-medium text-[var(--color-muted)]">
        <span className="relative z-10 bg-white px-2">hoặc</span>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-line)]" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        loading={googleLoading}
        onClick={() => void onGoogleLogin()}
      >
        <GoogleGlyph />
        Đăng nhập với Google
      </Button>

      <AuthFooterLinks
        links={[
          { to: '/auth/forgot-password', label: 'Quên mật khẩu?' },
          { to: '/auth/register/buyer', label: 'Đăng ký người mua' },
          { to: '/auth/register/seller', label: 'Đăng ký đối tác' },
        ]}
      />
    </AuthLayout>
  );
}

function GoogleGlyph() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.48a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.53-5.17 3.53-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.92H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.31A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.38-2.31V6.59H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.41l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.3 6.59l4.01 3.1C6.25 6.85 8.89 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function CheckEmailPage() {
  const location = useLocation();
  const locationState = location.state as AuthLocationState;
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(locationState?.registeredEmail ?? user?.email ?? '');
  const [info, setInfo] = useState(locationState?.authNotice ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    setError('');
    setInfo('');
    const id = (email || user?.email || '').trim();
    if (!id) {
      setError('Nhập email hoặc số điện thoại đã đăng ký');
      return;
    }
    setLoading(true);
    try {
      await authApi.resendVerification(id);
      setInfo('Nếu tài khoản tồn tại, email xác minh đã được gửi lại.');
      toast('Đã gửi lại email xác minh', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Kiểm tra email của bạn"
      subtitle="Chúng tôi đã gửi liên kết xác minh đến email đăng ký"
    >
      {info ? (
        <Alert variant="success">{info}</Alert>
      ) : (
        <Alert variant="info">
          Sau khi xác minh, bạn sẽ được chuyển đến trang đăng nhập. Chưa nhận được mail? Gửi lại bên dưới.
        </Alert>
      )}
      {error && <Alert variant="error" className="mt-3">{error}</Alert>}
      <div className="mt-4 space-y-3">
        {!isAuthenticated || !user?.email ? (
          <Input
            label="Email hoặc SĐT"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Gửi lại tới <span className="font-medium text-[var(--color-ink)]">{user.email}</span>
          </p>
        )}
        <Button className="w-full" loading={loading} onClick={() => void resend()}>
          Gửi lại email xác minh
        </Button>
        <Link to="/auth/login">
          <Button className="w-full" variant="outline">
            Về trang đăng nhập
          </Button>
        </Link>
      </div>
    </AuthLayout>
  );
}

/** Dedup verify khi React StrictMode mount 2 lần (token chỉ dùng 1 lần). */
const verifyEmailInflight = new Map<string, Promise<unknown>>();

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'ok' | 'error' | 'pending'>('pending');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function boot() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(window.location.search);
      const error =
        hashParams.get('error_description') ||
        hashParams.get('error') ||
        queryParams.get('error_description') ||
        queryParams.get('error');
      const tokenHash = queryParams.get('token_hash');
      const rawType = queryParams.get('type') ?? 'signup';
      const otpType =
        rawType === 'signup' || rawType === 'email' || rawType === 'magiclink' ? rawType : 'signup';

      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (error) {
        if (!cancelled) {
          setStatus('error');
          toast('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 'error');
        }
        return;
      }

      if (tokenHash) {
        const cacheKey = `verify-email:${otpType}:${tokenHash}`;
        let pending = verifyEmailInflight.get(cacheKey);
        if (!pending) {
          pending = authApi.verifyEmail({ tokenHash, type: otpType }).finally(() => {
            verifyEmailInflight.delete(cacheKey);
          });
          verifyEmailInflight.set(cacheKey, pending);
        }
        try {
          await pending;
        } catch {
          if (!cancelled) {
            setStatus('error');
            toast('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 'error');
          }
          return;
        }
      } else {
        // Thiếu token_hash — kể cả khi URL có access_token/code (link cũ dạng khác),
        // không có cách nào xác minh phía client nên không được báo thành công giả.
        if (!cancelled) {
          setStatus('error');
          toast('Thiếu liên kết xác minh. Hãy mở đúng link trong email.', 'error');
        }
        return;
      }

      if (cancelled) return;
      setStatus('ok');
      toast('Xác thực email thành công', 'success');
      timer = window.setTimeout(() => {
        navigate('/auth/login?verified=1', {
          replace: true,
          state: { authNotice: 'Email đã được xác minh. Vui lòng đăng nhập để tiếp tục.' },
        });
      }, 1600);
    }

    void boot();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [navigate, toast]);

  if (status === 'error') {
    return (
      <AuthLayout title="Xác minh email" subtitle="Không xác minh được">
        <Alert variant="error">
          Liên kết xác minh không hợp lệ hoặc đã hết hạn. Hãy đăng nhập và dùng “Gửi lại email xác minh”.
        </Alert>
        <div className="mt-6 space-y-3">
          <Link to="/auth/check-email">
            <Button className="w-full">Gửi lại email xác minh</Button>
          </Link>
          <Link to="/auth/login">
            <Button className="w-full" variant="outline">
              Về trang đăng nhập
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Xác minh email"
      subtitle={status === 'pending' ? 'Đang xác minh…' : 'Thành công'}
    >
      <Alert variant={status === 'pending' ? 'info' : 'success'}>
        {status === 'pending'
          ? 'Vui lòng chờ trong giây lát.'
          : 'Email của bạn đã được xác minh. Đang chuyển tới trang đăng nhập…'}
      </Alert>
      {status === 'ok' && (
        <div className="mt-6">
          <Button
            className="w-full"
            onClick={() =>
              navigate('/auth/login?verified=1', {
                replace: true,
                state: { authNotice: 'Email đã được xác minh. Vui lòng đăng nhập để tiếp tục.' },
              })
            }
          >
            Đăng nhập ngay
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
