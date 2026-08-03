import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, resetPasswordSchema } from '@langdaihoc/shared';
import { AuthLayout, AuthFooterLinks, SubmitRow } from '@/components/layout/auth-layout';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { authApi } from '@/lib/api';

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
    } catch {
      const fallback =
        'Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu tới email của bạn hoặc tài khoản chưa được tạo.';
      setMessage(fallback);
      toast(fallback, 'success');
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

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [tokens] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hashParams.get('access_token') ?? '';
    const refreshToken = hashParams.get('refresh_token') ?? '';
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return { accessToken, refreshToken };
  });
  const { accessToken, refreshToken } = tokens;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setError('');
    try {
      const result = await authApi.resetPassword({
        ...data,
        accessToken,
        refreshToken,
      });
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

  if (!accessToken) {
    return (
      <AuthLayout title="Đặt lại mật khẩu">
        <Alert variant="error">Liên kết đặt lại mật khẩu không hợp lệ.</Alert>
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
