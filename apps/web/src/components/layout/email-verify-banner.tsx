import { Link } from 'react-router-dom';
import { MailWarning } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Alert } from '@/components/ui/card';

/** Banner khi buyer đã đăng nhập nhưng chưa xác minh email. */
export function EmailVerifyBanner() {
  const { user, isAuthenticated, isActiveBuyer } = useAuth();

  if (!isAuthenticated || !user || isActiveBuyer) return null;
  if (user.role !== 'buyer') return null;

  return (
    <Alert variant="warning" className="mb-4 flex items-start gap-2 text-sm">
      <MailWarning className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Xác minh email để đặt hàng</p>
        <p className="mt-0.5 text-[var(--color-muted)]">
          Kiểm tra hộp thư (kể cả thư mục spam) hoặc{' '}
          <Link to="/auth/check-email" className="font-semibold text-brand-orange underline">
            gửi lại email xác minh
          </Link>
          .
        </p>
      </div>
    </Alert>
  );
}
