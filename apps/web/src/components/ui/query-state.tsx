import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Trạng thái lỗi chuẩn cho các query danh sách/chi tiết.
 * Hiện thông báo thân thiện + nút thử lại (refetch).
 */
export function QueryErrorState({
  message = 'Không tải được dữ liệu',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`panel py-10 text-center ${className ?? ''}`}>
      <p className="text-3xl" aria-hidden="true">⚠️</p>
      <p className="mt-2 text-sm font-semibold">{message}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Kiểm tra kết nối mạng rồi thử lại.</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" /> Thử lại
        </Button>
      )}
    </div>
  );
}
