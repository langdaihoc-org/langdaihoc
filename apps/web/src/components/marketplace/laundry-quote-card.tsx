import { Scale, Clock, AlertCircle } from 'lucide-react';
import type { LaundryOrderDetail, Order } from '@/lib/api';
import { formatPrice, laundryUnitLabel } from '@/lib/format';
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
  const estimatedQty = Number(laundry.estimatedQty ?? 0);
  const estimatedTotal = Number(order.subtotal ?? order.total);
  const hasQuote = laundry.finalPrice != null && laundry.finalPrice !== '';
  const actualQty = Number(laundry.actualQty ?? 0);
  const unitPrice = Number(laundry.unitPrice ?? 0);
  const surcharge = Number(laundry.surcharge ?? 0);
  const finalPrice = Number(laundry.finalPrice ?? 0);
  const unit = laundryUnitLabel(laundry.estimatedUnit);

  const waitingQuote = order.status === 'picked_up' && !hasQuote;
  const awaitingConfirm = order.status === 'waiting_price_confirmation' && hasQuote;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-brand-green">
          <Scale className="size-5" />
        </span>
        <div>
          <p className="font-bold">{laundry.serviceName}</p>
          <p className="text-xs text-[var(--color-muted)]">Dịch vụ giặt</p>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--color-surface)] p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Ước tính ban đầu</p>
        <div className="flex justify-between">
          <span>Khối lượng ước lượng</span>
          <span className="font-medium">{estimatedQty} {unit}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>Tạm tính</span>
          <span className="text-brand-green">{formatPrice(estimatedTotal)}</span>
        </div>
      </div>

      {waitingQuote && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>Cửa hàng đang cân đồ thực tế và sẽ báo giá chính thức. Bạn sẽ được thông báo khi có báo giá.</p>
        </div>
      )}

      {hasQuote && (
        <div className="space-y-2 rounded-xl border border-brand-green/30 bg-green-50/40 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Báo giá chính thức</p>
          <div className="flex justify-between">
            <span>Khối lượng thực tế</span>
            <span className="font-medium">{actualQty} {unit}</span>
          </div>
          <div className="flex justify-between">
            <span>Đơn giá</span>
            <span>{formatPrice(unitPrice)}/{unit}</span>
          </div>
          <div className="flex justify-between">
            <span>{actualQty} × {formatPrice(unitPrice)}</span>
            <span>{formatPrice(actualQty * unitPrice)}</span>
          </div>
          {surcharge > 0 && (
            <div className="flex justify-between">
              <span>Phụ phí</span>
              <span>{formatPrice(surcharge)}</span>
            </div>
          )}
          <div className="my-1 h-px bg-brand-green/20" />
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
            <p>Giá thực tế khác ước tính. Vui lòng xác nhận trước khi cửa hàng bắt đầu giặt.</p>
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
