import { useState } from 'react';
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

  return (
    <AuthLayout title="Đăng nhập" subtitle="Dùng email hoặc số điện thoại đã đăng ký">
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

export function VerifyEmailPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout title="Xác minh email" subtitle="Đang xử lý...">
      <Alert variant="info">
        Email của bạn đã được xác minh. Vui lòng đăng nhập để tiếp tục.
      </Alert>
      <div className="mt-6">
        <Button className="w-full" onClick={() => navigate('/auth/login?verified=1')}>
          Đăng nhập ngay
        </Button>
      </div>
    </AuthLayout>
  );
}
