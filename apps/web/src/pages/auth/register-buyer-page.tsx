import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { buyerRegisterSchema, type BuyerRegisterInput } from '@langdaihoc/shared';
import { AuthLayout, AuthFooterLinks, SubmitRow } from '@/components/layout/auth-layout';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { authApi, ApiError } from '@/lib/api';
import { isSafeInternalPath } from '@langdaihoc/shared';

export function BuyerRegisterPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BuyerRegisterInput>({
    resolver: zodResolver(buyerRegisterSchema),
  });

  const onSubmit = handleSubmit(async (data) => {
    setError('');
    try {
      const result = await authApi.registerBuyer(data);
      toast(result.message, 'success');
      const dest =
        typeof result.redirectTo === 'string' && isSafeInternalPath(result.redirectTo)
          ? result.redirectTo
          : '/auth/check-email';
      navigate(dest, {
        replace: true,
        state: { authNotice: result.message, registeredEmail: data.email },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng ký thất bại');
    }
  });

  return (
    <AuthLayout
      title="Đăng ký tài khoản"
      subtitle="Dùng email hoặc số điện thoại để đăng nhập sau này"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input label="Họ và tên" error={errors.fullName?.message} {...register('fullName')} />
        <Input
          label="Email"
          type="email"
          placeholder="email@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Số điện thoại (tuỳ chọn)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901234567 — dùng để đăng nhập"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <Input
          label="Mật khẩu"
          type="password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Xác nhận mật khẩu"
          type="password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" {...register('agreeTerms')} className="mt-1 rounded" />
          <span>Tôi đồng ý điều khoản sử dụng</span>
        </label>
        {errors.agreeTerms && <p className="text-xs text-red-500">{errors.agreeTerms.message}</p>}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" {...register('agreePrivacy')} className="mt-1 rounded" />
          <span>Tôi đồng ý chính sách bảo mật</span>
        </label>
        {errors.agreePrivacy && (
          <p className="text-xs text-red-500">{errors.agreePrivacy.message}</p>
        )}

        <SubmitRow loading={isSubmitting} label="Đăng ký" />
      </form>

      <AuthFooterLinks links={[{ to: '/auth/login', label: 'Đã có tài khoản? Đăng nhập' }]} />
    </AuthLayout>
  );
}
