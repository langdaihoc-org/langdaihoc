import { Clock, AlertCircle } from 'lucide-react';
import type { LaundryOrderDetail, Order } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LaundryQuoteCard({
  laundry,
  order,
  onConfirm,
  onReject,
  confirmLoading,
  rejectLoading,
}: {
  laundry: LaundryOrderDetail;
  order: Order;
  onConfirm?: () => void;
  onReject?: () => void;
  confirmLoading?: boolean;
  rejectLoading?: boolean;
}) {
  const hasQuote = laundry.finalPrice != null && laundry.finalPrice !== '';
  const finalPrice = Number(laundry.finalPrice ?? 0);

  const waitingQuote = order.status === 'picked_up' && !hasQuote;
  const awaitingConfirm = order.status === 'waiting_price_confirmation' && hasQuote;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-brand-green">
          <Clock className="size-5" />
        </span>
        <div>
          <p className="font-bold">{laundry.serviceName}</p>
          <p className="text-xs text-[var(--color-muted)]">Dịch vụ giặt</p>
        </div>
      </div>

      {waitingQuote && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>Cửa hàng đang kiểm tra đồ và sẽ báo giá chính thức. Bạn sẽ được thông báo khi có báo giá.</p>
        </div>
      )}

      {hasQuote && (
        <div className="space-y-2 rounded-xl border border-brand-green/30 bg-green-50/40 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Báo giá chính thức</p>
          <div className="flex justify-between text-base font-bold">
            <span>Tổng thanh toán</span>
            <span className="text-brand-green">{formatPrice(finalPrice)}</span>
          </div>
          {laundry.sellerNote && (
            <p className="pt-1 text-xs text-[var(--color-muted)]">Ghi chú quán: {laundry.sellerNote}</p>
          )}
        </div>
      )}

      {awaitingConfirm && (
        <div className="space-y-3">
          <div className="flex gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>Vui lòng xác nhận báo giá trước khi cửa hàng bắt đầu giặt.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="green" className="flex-1" loading={confirmLoading} onClick={onConfirm}>
              Xác nhận giá
            </Button>
            <Button variant="outline" className="flex-1" loading={rejectLoading} onClick={onReject}>
              Từ chối
            </Button>
          </div>
        </div>
      )}

      {hasQuote && !awaitingConfirm && order.status !== 'cancelled' && (
        <p className={cn('text-xs text-[var(--color-muted)]', laundry.buyerPriceConfirmedAt && 'text-brand-green')}>
          {laundry.buyerPriceConfirmedAt
            ? 'Bạn đã xác nhận báo giá.'
            : order.status === 'cancelled'
              ? 'Đơn đã hủy sau khi từ chối báo giá.'
              : null}
        </p>
      )}
    </Card>
  );
}
