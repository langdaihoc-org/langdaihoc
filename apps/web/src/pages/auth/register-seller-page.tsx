import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sellerRegisterSchema, type SellerRegisterInput } from '@langdaihoc/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout, AuthFooterLinks, SubmitRow } from '@/components/layout/auth-layout';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { authApi, ApiError } from '@/lib/api';
import { isSafeInternalPath } from '@langdaihoc/shared';

export function SellerRegisterPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SellerRegisterInput>({
    resolver: zodResolver(sellerRegisterSchema),
    defaultValues: { intendedService: 'food' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setError('');
    try {
      const result = await authApi.registerSeller(data);
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
      title="Đăng ký đối tác"
      subtitle="Chỉ cần thông tin liên hệ — admin sẽ gọi và duyệt trước khi mở cửa hàng"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          Tài khoản nhận đồ ship hộ không đăng ký tại đây — chỉ admin thêm nội bộ.
        </div>

        <Input label="Họ và tên" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Email liên hệ" type="email" error={errors.email?.message} {...register('email')} />
        <Input label="Số điện thoại liên hệ *" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Muốn bán</label>
          <select
            {...register('intendedService')}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm"
          >
            <option value="food">Ăn uống</option>
            <option value="laundry">Giặt đồ</option>
          </select>
        </div>

        <Input
          label="Ghi chú cho admin (tuỳ chọn)"
          placeholder="Giờ liên hệ, khu vực kinh doanh..."
          error={errors.contactNote?.message}
          {...register('contactNote')}
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

        <SubmitRow loading={isSubmitting} label="Gửi đăng ký" />
      </form>

      <AuthFooterLinks links={[{ to: '/auth/login', label: 'Đã có tài khoản? Đăng nhập' }]} />
    </AuthLayout>
  );
}
