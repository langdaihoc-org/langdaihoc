import { useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi, ordersApi, ApiError, type Complaint } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { complaintStatusLabel, orderStatusLabel, formatPrice, orderDisplayTitle, orderTypeLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { useToast } from '@/components/ui/toast';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';
import { Modal } from '@/components/ui/modal';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { ExternalLink, X } from 'lucide-react';

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
  const list = data?.data ?? [];
  const orderDetail = orderData?.data;
  const viewingComplaint = list.find((c) => c.orderId === orderViewId);

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Khiếu nại từ khách</h1>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có khiếu nại</Card>
      ) : list.map((c: Complaint) => (
        <Card key={c.id} className="space-y-3">
          {!['resolved', 'rejected'].includes(c.status) && (
            <p className="rounded-xl border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950">
              Khiếu nại từ khách · {c.reason}
              <span className="mt-0.5 block font-normal text-amber-950/80">
                {complaintStatusLabel(c.status)} · {new Date(c.createdAt).toLocaleString('vi')}
              </span>
            </p>
          )}
          <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}>
            <div>
              <p className="font-semibold">{c.reason}</p>
              {c.buyer && (
                <p className="text-xs text-[var(--color-muted)]">
                  {c.buyer.fullName} · {c.buyer.email} · {c.buyer.phone ?? '—'}
                </p>
              )}
              {c.order && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Đơn {c.order.orderCode} · {orderStatusLabel(c.order.status, c.order.type)}
                </p>
              )}
            </div>
            <StatusBadge variant={c.status === 'resolved' ? 'green' : c.status === 'rejected' ? 'red' : 'orange'}>{complaintStatusLabel(c.status)}</StatusBadge>
          </button>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={(e) => {
              e.stopPropagation();
              setOrderViewId(c.orderId);
            }}
          >
            <ExternalLink className="size-3.5" />
            Xem đơn bị khiếu nại
            {c.order?.orderCode ? ` (${c.order.orderCode})` : ''}
          </Button>
          {expandedId === c.id && (
            <ComplaintThread
              complaint={c}
              messages={messagesData?.data ?? []}
              viewerRole="seller"
              sending={replyMut.isPending}
              onSend={(body) => replyMut.mutateAsync({ id: c.id, body })}
            />
          )}
        </Card>
      ))}

      <Modal
        open={!!orderViewId}
        onClose={() => setOrderViewId(null)}
        titleId={titleId}
        zIndexClass="z-[110]"
        panelClassName="w-full max-w-lg overflow-hidden rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} className="font-bold">Đơn bị khiếu nại</h2>
          <button
            type="button"
            onClick={() => setOrderViewId(null)}
            aria-label="Đóng"
            className="flex size-9 items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </div>
        {orderLoading ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">Đang tải đơn...</p>
        ) : orderError || !orderDetail?.order ? (
          <p className="py-6 text-center text-sm text-red-600">Không tải được thông tin đơn</p>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {orderDisplayTitle({
                    ...orderDetail.order,
                    items: orderDetail.items,
                    laundry: orderDetail.laundry,
                    shipProxy: orderDetail.shipProxy,
                  })}
                </p>
                <p className="text-xs text-[var(--color-muted)]">{orderDetail.order.orderCode}</p>
              </div>
              <StatusBadge>{orderStatusLabel(orderDetail.order.status, orderDetail.order.type)}</StatusBadge>
            </div>
            <div className="grid gap-1.5 rounded-xl bg-black/[0.03] px-3 py-2 text-xs">
              <p><span className="text-[var(--color-muted)]">Loại:</span> {orderTypeLabel(orderDetail.order.type)}</p>
              <p><span className="text-[var(--color-muted)]">Tổng:</span> <span className="font-semibold text-brand-orange">{formatPrice(orderDetail.order.total)}</span></p>
              <p><span className="text-[var(--color-muted)]">Đặt lúc:</span> {new Date(orderDetail.order.createdAt).toLocaleString('vi')}</p>
              {viewingComplaint?.buyer && (
                <p>
                  <span className="text-[var(--color-muted)]">Khách:</span>{' '}
                  {viewingComplaint.buyer.fullName} · {viewingComplaint.buyer.phone ?? '—'}
                </p>
              )}
              {(orderDetail.order.recipientPhone || orderDetail.order.deliveryAddress?.phone) && (
                <p>
                  <span className="text-[var(--color-muted)]">SĐT giao:</span>{' '}
                  <a
                    href={`tel:${orderDetail.order.recipientPhone || orderDetail.order.deliveryAddress?.phone}`}
                    className="font-semibold text-brand-orange"
                  >
                    {orderDetail.order.recipientPhone || orderDetail.order.deliveryAddress?.phone}
                  </a>
                </p>
              )}
              {orderDetail.order.deliveryAddress && (
                <p><span className="text-[var(--color-muted)]">Giao tới:</span> {formatAddressLine(orderDetail.order.deliveryAddress)}</p>
              )}
            </div>
            {orderDetail.items && orderDetail.items.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-[var(--color-line)] p-3">
                {orderDetail.items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium">{item.itemName} ×{item.quantity}</span>
                      {!!item.options?.length && (
                        <span className="mt-0.5 block text-[var(--color-muted)]">
                          {item.options.map((o) => o.name).join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-brand-orange">{formatPrice(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
            {orderDetail.order.notes && (
              <p className="text-xs text-[var(--color-muted)]">Ghi chú: {orderDetail.order.notes}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
