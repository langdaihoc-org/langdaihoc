import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-orange-dark">404</p>
      <h1 className="mt-2 text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
        Đường dẫn không tồn tại hoặc đã bị gỡ. Quay lại trang chủ để tiếp tục đặt món, giặt đồ hoặc ship hộ.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/">
          <Button>Về trang chủ</Button>
        </Link>
        <Link to="/food">
          <Button variant="outline">Ăn uống</Button>
        </Link>
      </div>
    </div>
  );
}
