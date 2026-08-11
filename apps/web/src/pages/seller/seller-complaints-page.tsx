import { useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi, ordersApi, ApiError, type Complaint } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { orderStatusLabel, formatPrice, orderDisplayTitle, orderTypeLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { useToast } from '@/components/ui/toast';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';
import { Modal } from '@/components/ui/modal';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { ChevronRight, Clock, MapPin, User, X } from 'lucide-react';
import { refreshSellerOrderMeta } from './seller-shared';

export function SellerComplaintsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const titleId = useId();
  const { data, isLoading } = useQuery({ queryKey: ['seller-complaints'], queryFn: () => sellerApi.complaints() });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderViewId, setOrderViewId] = useState<string | null>(null);
  const { data: messagesData } = useQuery({
    queryKey: ['seller-complaint-messages', expandedId],
    queryFn: () => sellerApi.complaintMessages(expandedId!),
    enabled: !!expandedId,
  });
  const { data: orderData, isLoading: orderLoading, isError: orderError } = useQuery({
    queryKey: ['order', orderViewId],
    queryFn: () => ordersApi.get(orderViewId!),
    enabled: !!orderViewId,
  });
  const replyMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => sellerApi.addComplaintMessage(id, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['seller-complaint-messages', vars.id] });
      qc.invalidateQueries({ queryKey: ['seller-complaints'] });
      toast('Đã gửi phản hồi', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được tin nhắn', 'error'),
  });
  const resolveMut = useMutation({
    mutationFn: (id: string) => sellerApi.resolveComplaint(id),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['seller-complaints'] });
      qc.invalidateQueries({ queryKey: ['seller-complaint-messages', id] });
      refreshSellerOrderMeta(qc);
      toast('Đã đánh dấu giải quyết', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không đóng được khiếu nại', 'error'),
  });
  const list = data?.data ?? [];
  const orderDetail = orderData?.data;
  const o = orderDetail?.order;
  const viewingComplaint = list.find((c) => c.orderId === orderViewId);

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Khiếu nại từ khách</h1>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có khiếu nại</Card>
      ) : list.map((c: Complaint) => {
        const closed = c.status === 'resolved' || c.status === 'rejected';
        return (
          <Card key={c.id} className="space-y-3">
            {!closed && (
              <p className="rounded-xl border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950">
                Khiếu nại từ khách · {c.reason}
                <span className="mt-0.5 block font-normal text-amber-950/80">
                  {new Date(c.createdAt).toLocaleString('vi')}
                </span>
              </p>
            )}
            <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}>
              <div className="min-w-0">
                <p className="font-semibold">{c.reason}</p>
                {c.buyer && (
                  <p className="text-xs text-[var(--color-muted)]">
                    {c.buyer.fullName} · {c.buyer.email} · {c.buyer.phone ?? '—'}
                  </p>
                )}
              </div>
              {closed && (
                <StatusBadge variant={c.status === 'resolved' ? 'green' : 'red'}>
                  {c.status === 'resolved' ? 'Đã xử lý' : 'Từ chối'}
                </StatusBadge>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOrderViewId(c.orderId);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition-colors hover:border-brand-orange/40 hover:bg-sky-50/60"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">Đơn liên quan</p>
                <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                  {c.order?.orderCode ?? 'Xem chi tiết đơn'}
                  {c.order ? (
                    <span className="font-normal text-[var(--color-muted)]">
                      {' · '}
                      {orderStatusLabel(c.order.status, c.order.type)}
                      {c.order.total != null ? ` · ${formatPrice(c.order.total)}` : ''}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-orange">
                Xem đơn
                <ChevronRight className="size-3.5" />
              </span>
            </button>
            {expandedId === c.id && (
              <ComplaintThread
                complaint={c}
                messages={messagesData?.data ?? []}
                viewerRole="seller"
                hideOpenStatus
                sending={replyMut.isPending}
                onSend={(body) => replyMut.mutateAsync({ id: c.id, body })}
              />
            )}
            {c.canSellerResolve && (
              <Button
                size="sm"
                variant="green"
                className="w-full sm:w-auto"
                loading={resolveMut.isPending && resolveMut.variables === c.id}
                onClick={() => resolveMut.mutate(c.id)}
              >
                Đã giải quyết
              </Button>
            )}
          </Card>
        );
      })}

      <Modal
        open={!!orderViewId}
        onClose={() => setOrderViewId(null)}
        titleId={titleId}
        zIndexClass="z-[110]"
        overlayClassName="items-center p-4"
        panelClassName="w-full max-w-lg overflow-hidden rounded-3xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">Đơn bị khiếu nại</p>
            <h2 id={titleId} className="font-bold leading-tight">
              {o ? orderDisplayTitle({ ...o, items: orderDetail?.items, laundry: orderDetail?.laundry, shipProxy: orderDetail?.shipProxy }) : 'Chi tiết đơn'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOrderViewId(null)}
            aria-label="Đóng"
            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </div>
        {orderLoading ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">Đang tải đơn...</p>
        ) : orderError || !o ? (
          <p className="py-8 text-center text-sm text-red-600">Không tải được thông tin đơn</p>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--color-muted)]">{o.orderCode}</p>
              <StatusBadge variant={o.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(o.status, o.type)}</StatusBadge>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--color-muted)]">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(o.createdAt).toLocaleString('vi')}
              </span>
              {(viewingComplaint?.buyer?.fullName || o.buyerName) && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {viewingComplaint?.buyer?.fullName || o.buyerName}
                </span>
              )}
              <span className="text-[var(--color-muted)]">{orderTypeLabel(o.type)}</span>
              <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
            </div>

            {o.type === 'food' && orderDetail?.items && orderDetail.items.length > 0 && (
              <ul className="space-y-2 rounded-xl bg-black/[0.02] p-3 text-sm">
                {orderDetail.items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.itemName} ×{item.quantity}</p>
                      {!!item.options?.length && (
                        <p className="text-xs text-[var(--color-muted)]">
                          {item.options.map((opt) => opt.name).join(', ')}
                        </p>
                      )}
                      {item.note && (
                        <p className="text-xs italic text-[var(--color-muted)]">Ghi chú: {item.note}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-medium text-brand-orange">{formatPrice(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}

            {o.type === 'food' && (o.deliveryAddress || o.recipientPhone || o.recipientName) && (
              <div className="space-y-1 rounded-xl border border-[var(--color-line)] p-3 text-xs">
                <p className="font-semibold text-[var(--color-ink)]">Giao tới</p>
                {(o.recipientName || o.deliveryAddress?.recipientName) && (
                  <p className="font-medium">{o.recipientName || o.deliveryAddress?.recipientName}</p>
                )}
                {o.deliveryAddress && (
                  <p className="flex items-start gap-1 text-[var(--color-muted)]">
                    <MapPin className="mt-0.5 size-3 shrink-0" />
                    <span>{formatAddressLine(o.deliveryAddress)}</span>
                  </p>
                )}
                {(o.recipientPhone || o.deliveryAddress?.phone) && (
                  <p>
                    <strong>SĐT:</strong>{' '}
                    <a
                      href={`tel:${o.recipientPhone || o.deliveryAddress?.phone}`}
                      className="font-semibold text-brand-orange"
                    >
                      {o.recipientPhone || o.deliveryAddress?.phone}
                    </a>
                  </p>
                )}
                {o.desiredDeliveryAt && (
                  <p className="flex items-center gap-1 text-[var(--color-muted)]">
                    <Clock className="size-3" />
                    Mong muốn: {new Date(o.desiredDeliveryAt).toLocaleString('vi')}
                  </p>
                )}
              </div>
            )}

            {o.type === 'laundry' && orderDetail?.laundry && (
              <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-sm">
                <p className="font-medium">{orderDetail.laundry.serviceName}</p>
                {orderDetail.laundry.estimatedQty != null && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Ước tính: {orderDetail.laundry.estimatedQty}
                    {orderDetail.laundry.estimatedUnit === 'kg'
                      ? 'kg'
                      : orderDetail.laundry.estimatedUnit === 'item'
                        ? ' món'
                        : orderDetail.laundry.estimatedUnit === 'load'
                          ? ' tải'
                          : ''}
                  </p>
                )}
                {orderDetail.laundry.finalPrice != null && (
                  <p className="text-xs">
                    Giá chốt: <span className="font-semibold text-brand-orange">{formatPrice(orderDetail.laundry.finalPrice)}</span>
                  </p>
                )}
              </div>
            )}

            {o.type === 'ship_proxy' && orderDetail?.shipProxy && (
              <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-sm">
                <p><span className="text-[var(--color-muted)]">Số shipper:</span> {orderDetail.shipProxy.trackingCode}</p>
                <p><span className="text-[var(--color-muted)]">Lấy tại:</span> {orderDetail.shipProxy.pickupLocation}</p>
                <p><span className="text-[var(--color-muted)]">Giờ lấy:</span> {new Date(orderDetail.shipProxy.pickupAt).toLocaleString('vi')}</p>
                <p><span className="text-[var(--color-muted)]">Giao lại:</span> {orderDetail.shipProxy.returnAddressText}</p>
                <p>
                  <span className="text-[var(--color-muted)]">SĐT khách:</span>{' '}
                  <a href={`tel:${orderDetail.shipProxy.contactPhone}`} className="font-semibold text-brand-orange">
                    {orderDetail.shipProxy.contactPhone}
                  </a>
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Phí nhận hộ:</span>{' '}
                  <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
                </p>
              </div>
            )}

            {viewingComplaint?.buyer?.phone && o.type !== 'food' && (
              <p className="text-xs text-[var(--color-muted)]">
                SĐT khách:{' '}
                <a href={`tel:${viewingComplaint.buyer.phone}`} className="font-semibold text-brand-orange">
                  {viewingComplaint.buyer.phone}
                </a>
              </p>
            )}

            {o.notes && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Ghi chú: {o.notes}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
