import { useEffect, useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { sellerApi, ordersApi, ApiError, type Complaint } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { orderStatusLabel, formatPrice, orderDisplayTitle, orderTypeLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { useToast } from '@/components/ui/toast';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';
import { Modal } from '@/components/ui/modal';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { ChevronRight, Clock, MapPin, MessageCircle, User, X } from 'lucide-react';
import { refreshSellerOrderMeta } from './seller-shared';
import { cn } from '@/lib/utils';

function previewLabel(role?: string | null) {
  if (role === 'buyer') return 'Khách';
  if (role === 'seller') return 'Bạn';
  if (role === 'admin') return 'Admin';
  return 'Tin';
}

export function SellerComplaintsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const titleId = useId();
  const chatTitleId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ['seller-complaints'], queryFn: () => sellerApi.complaints() });
  const [chatId, setChatId] = useState<string | null>(null);
  const [orderViewId, setOrderViewId] = useState<string | null>(null);

  const list = data?.data ?? [];
  const activeComplaint = list.find((c) => c.id === chatId) ?? null;

  useEffect(() => {
    const fromUrl = searchParams.get('c');
    if (!fromUrl || !list.length) return;
    if (list.some((c) => c.id === fromUrl)) setChatId(fromUrl);
  }, [searchParams, list]);

  const openChat = (id: string) => {
    setChatId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('c', id);
      return next;
    }, { replace: true });
  };

  const closeChat = () => {
    setChatId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('c');
      return next;
    }, { replace: true });
  };

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['seller-complaint-messages', chatId],
    queryFn: () => sellerApi.complaintMessages(chatId!),
    enabled: !!chatId,
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
  const orderDetail = orderData?.data;
  const o = orderDetail?.order;
  const viewingComplaint = list.find((c) => c.orderId === orderViewId);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold">Khiếu nại từ khách</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">Bấm vào khiếu nại để mở hội thoại với khách.</p>
      </div>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có khiếu nại</Card>
      ) : list.map((c: Complaint) => {
        const closed = c.status === 'resolved' || c.status === 'rejected';
        return (
          <Card key={c.id} className={cn('space-y-2.5', c.unreadFromBuyer && 'ring-1 ring-brand-orange/35')}>
            {!closed && (
              <p className="rounded-xl border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950">
                Khiếu nại từ khách · {c.reason}
                <span className="mt-0.5 block font-normal text-amber-950/80">
                  {new Date(c.createdAt).toLocaleString('vi')}
                </span>
              </p>
            )}
            <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => openChat(c.id)}>
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-brand-orange">
                <MessageCircle className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.reason}</p>
                  {closed ? (
                    <StatusBadge variant={c.status === 'resolved' ? 'green' : 'red'}>
                      {c.status === 'resolved' ? 'Đã xử lý' : 'Từ chối'}
                    </StatusBadge>
                  ) : c.unreadFromBuyer ? (
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-brand-orange" aria-label="Tin mới" />
                  ) : null}
                </div>
                {c.buyer && (
                  <p className="text-xs text-[var(--color-muted)]">
                    {c.buyer.fullName}
                    {c.order?.orderCode ? ` · ${c.order.orderCode}` : ''}
                  </p>
                )}
                <p className={cn('mt-1 truncate text-sm', c.unreadFromBuyer ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-muted)]')}>
                  {c.lastMessageBody
                    ? `${previewLabel(c.lastMessageRole)}: ${c.lastMessageBody}`
                    : 'Chưa có tin nhắn'}
                </p>
                {c.lastMessageAt && (
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {new Date(c.lastMessageAt).toLocaleString('vi')}
                  </p>
                )}
              </div>
            </button>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOrderViewId(c.orderId)}
              >
                Xem đơn
                <ChevronRight className="size-3.5" />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openChat(c.id)}>
                Mở chat
              </Button>
              {c.canSellerResolve && (
                <Button
                  size="sm"
                  variant="green"
                  loading={resolveMut.isPending && resolveMut.variables === c.id}
                  onClick={() => resolveMut.mutate(c.id)}
                >
                  Đã giải quyết
                </Button>
              )}
            </div>
          </Card>
        );
      })}

      <Modal
        open={!!chatId && !!activeComplaint}
        onClose={closeChat}
        titleId={chatTitleId}
        zIndexClass="z-[110]"
        overlayClassName="items-center p-3 sm:p-4"
        panelClassName="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white p-4 shadow-2xl sm:p-5"
      >
        {activeComplaint && (
          <>
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--color-line)] pb-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">Hội thoại khiếu nại</p>
                <h2 id={chatTitleId} className="truncate font-bold leading-tight">{activeComplaint.reason}</h2>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                  {activeComplaint.buyer?.fullName ?? 'Khách'}
                  {activeComplaint.order?.orderCode ? ` · ${activeComplaint.order.orderCode}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setOrderViewId(activeComplaint.orderId)}>
                  Xem đơn
                </Button>
                <button
                  type="button"
                  onClick={closeChat}
                  aria-label="Đóng"
                  className="flex size-9 items-center justify-center rounded-full hover:bg-black/5"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {messagesLoading ? (
              <p className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải tin nhắn...</p>
            ) : (
              <ComplaintThread
                complaint={activeComplaint}
                messages={messagesData?.data ?? []}
                viewerRole="seller"
                hideOpenStatus
                compactHeader
                sending={replyMut.isPending}
                onSend={(body) => replyMut.mutateAsync({ id: activeComplaint.id, body })}
              />
            )}
            {activeComplaint.canSellerResolve && (
              <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                <Button
                  size="sm"
                  variant="green"
                  className="w-full"
                  loading={resolveMut.isPending && resolveMut.variables === activeComplaint.id}
                  onClick={() => resolveMut.mutate(activeComplaint.id)}
                >
                  Đã giải quyết
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={!!orderViewId}
        onClose={() => setOrderViewId(null)}
        titleId={titleId}
        zIndexClass="z-[120]"
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
