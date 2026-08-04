import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { orderStatusLabel, formatPrice, orderTypeLabel, orderDisplayTitle, laundryUnitLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Clock, User, MapPin, ArrowUpDown, Package } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  NEXT_STATUS,
  SELLER_ACTIVE,
  SELLER_DONE,
  HIDDEN_ORDER,
  paymentMethodLabel,
  paymentStatusLabel,
  type DeliverSort,
  DELIVER_SORT_OPTIONS,
  sortDeliveringOrders,
  invalidateSellerOrders,
} from './seller-shared';

export function SellerOrdersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'active' | 'delivering' | 'done'>('active');
  const [deliverSort, setDeliverSort] = useState<DeliverSort>('time');
  const { data, isLoading, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['seller-orders'],
    queryFn: () => ordersApi.list(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const [quoteOrder, setQuoteOrder] = useState<string | null>(null);
  const [quoteFinalPrice, setQuoteFinalPrice] = useState('');
  const [quoteQty, setQuoteQty] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | { type: 'reject' | 'reject_ck'; id: string; code: string }>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const statusMut = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) => ordersApi.updateStatus(id, status, note),
    onSuccess: () => {
      invalidateSellerOrders(qc);
      setConfirmAction(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được trạng thái', 'error'),
  });
  const quoteMut = useMutation({
    mutationFn: (id: string) => {
      const finalPrice = Number(String(quoteFinalPrice).replace(/\D/g, ''));
      if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
        throw new ApiError('Nhập tổng báo giá hợp lệ', 400, 'INVALID_QUOTE');
      }
      const actualQty = quoteQty.trim() ? Number(quoteQty) : undefined;
      return ordersApi.submitQuote(id, {
        finalPrice,
        ...(actualQty != null && Number.isFinite(actualQty) && actualQty > 0 ? { actualQty } : {}),
        ...(quoteNote.trim() && { sellerNote: quoteNote.trim() }),
      });
    },
    onSuccess: () => {
      invalidateSellerOrders(qc);
      setQuoteOrder(null);
      setQuoteFinalPrice('');
      setQuoteQty('');
      setQuoteNote('');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được báo giá', 'error'),
  });
  const verifyMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => ordersApi.verifyPayment(id, approved),
    onSuccess: () => {
      invalidateSellerOrders(qc);
      setConfirmAction(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được thanh toán', 'error'),
  });
  const paidMut = useMutation({
    mutationFn: (id: string) => ordersApi.markPaid(id),
    onSuccess: () => invalidateSellerOrders(qc),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không đánh dấu đã thu tiền', 'error'),
  });
  const all = data?.data ?? [];

  const visible = useMemo(() => all.filter((o) => !HIDDEN_ORDER.has(o.status)), [all]);

  const counts = useMemo(() => ({
    active: visible.filter((o) => SELLER_ACTIVE.has(o.status) && o.status !== 'delivering' && o.status !== 'returning').length,
    delivering: visible.filter((o) => o.status === 'delivering' || o.status === 'returning').length,
    done: visible.filter((o) => SELLER_DONE.has(o.status)).length,
  }), [visible]);

  const orders = useMemo(() => {
    const filtered =
      tab === 'active'
        ? visible.filter((o) => SELLER_ACTIVE.has(o.status) && o.status !== 'delivering' && o.status !== 'returning')
        : tab === 'delivering'
          ? visible.filter((o) => o.status === 'delivering' || o.status === 'returning')
          : visible.filter((o) => SELLER_DONE.has(o.status));
    if (tab === 'delivering') return sortDeliveringOrders(filtered, deliverSort);
    return filtered;
  }, [visible, tab, deliverSort]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h1 className="font-bold">Quản lý đơn hàng</h1>
        <p className="text-[11px] text-[var(--color-muted)]">
          {isFetching
            ? 'Đang cập nhật…'
            : dataUpdatedAt
              ? `Theo dõi nhẹ · ${new Date(dataUpdatedAt).toLocaleTimeString('vi')}`
              : 'Theo dõi nhẹ · chỉ tải lại khi có thay đổi'}
        </p>
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="flex border-b border-[var(--color-line)]">
          {([
            ['active', 'Đang xử lý', counts.active],
            ['delivering', 'Đang giao', counts.delivering],
            ['done', 'Hoàn tất', counts.done],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors',
                tab === id ? 'border-b-2 border-brand-green text-brand-green' : 'text-[var(--color-muted)]',
              )}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {tab === 'delivering' && !isLoading && orders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] bg-black/[0.015] px-3 py-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-muted)]">
              <ArrowUpDown className="size-3.5" />
              Sắp xếp giao
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DELIVER_SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDeliverSort(opt.id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    deliverSort === opt.id
                      ? 'bg-brand-green text-white'
                      : 'bg-white text-[var(--color-muted)] ring-1 ring-[var(--color-line)] hover:text-[var(--color-ink)]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="mx-auto size-10 text-[var(--color-muted)]" />
            <p className="mt-2 text-sm text-[var(--color-muted)]">Chưa có đơn trong mục này</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-line)]">
            {orders.map((o) => {
              const next = NEXT_STATUS[o.type as keyof typeof NEXT_STATUS]?.[o.status];
              return (
                <Card key={o.id} className="rounded-none border-0 shadow-none">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{orderDisplayTitle(o)}</p>
                        <p className="text-xs text-[var(--color-muted)]">{o.orderCode}</p>
                      </div>
                      <StatusBadge variant={o.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(o.status, o.type)}</StatusBadge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                      <span className="flex items-center gap-1"><Clock className="size-3" />{new Date(o.createdAt).toLocaleString('vi')}</span>
                      {o.buyerName && <span className="flex items-center gap-1"><User className="size-3" />{o.buyerName}</span>}
                      <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
                    </div>

                    {o.type === 'food' && o.items && o.items.length > 0 && (
                      <ul className="space-y-2 rounded-xl bg-black/[0.02] p-3 text-sm">
                        {o.items.map((item, i) => (
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

                    {o.type === 'food' && !o.items?.length && (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Không có danh sách món — mở lại trang hoặc kiểm tra đơn.
                      </p>
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

                    {o.type === 'laundry' && o.laundry && (
                      <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-sm">
                        <p className="font-medium">{o.laundry.serviceName}</p>
                        {o.laundry.estimatedQty && (
                          <p className="text-xs text-[var(--color-muted)]">
                            Ước tính: {o.laundry.estimatedQty}
                            {o.laundry.estimatedUnit === 'kg' ? 'kg' : o.laundry.estimatedUnit === 'item' ? ' món' : o.laundry.estimatedUnit === 'load' ? ' tải' : ''}
                          </p>
                        )}
                        {o.laundry.finalPrice && (
                          <p className="text-xs">Giá chốt: <span className="font-semibold text-brand-orange">{formatPrice(o.laundry.finalPrice)}</span></p>
                        )}
                      </div>
                    )}

                    {o.type === 'ship_proxy' && o.shipProxy && (
                      <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-sm">
                        <p><span className="text-[var(--color-muted)]">Số shipper:</span> {o.shipProxy.trackingCode}</p>
                        <p><span className="text-[var(--color-muted)]">Lấy tại:</span> {o.shipProxy.pickupLocation}</p>
                        <p><span className="text-[var(--color-muted)]">Giờ lấy:</span> {new Date(o.shipProxy.pickupAt).toLocaleString('vi')}</p>
                        <p><span className="text-[var(--color-muted)]">SĐT nhận đơn hàng:</span> {o.shipProxy.receivePhone}</p>
                        <p><span className="text-[var(--color-muted)]">Giao lại:</span> {o.shipProxy.returnAddressText}</p>
                        <p><span className="text-[var(--color-muted)]">Giờ giao lại:</span> {new Date(o.shipProxy.returnAt).toLocaleString('vi')}</p>
                        <p>
                          <span className="text-[var(--color-muted)]">SĐT khách:</span>{' '}
                          <a href={`tel:${o.shipProxy.contactPhone}`} className="font-semibold text-brand-orange">{o.shipProxy.contactPhone}</a>
                        </p>
                        <p>
                          <span className="text-[var(--color-muted)]">Giá tiền hàng:</span>{' '}
                          <span className="font-semibold">{formatPrice(o.shipProxy.packageValue ?? 0)}</span>
                        </p>
                        <p>
                          <span className="text-[var(--color-muted)]">Phí nhận hộ:</span>{' '}
                          <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
                        </p>
                      </div>
                    )}

                    {o.type === 'laundry' && (o.pickupAddress || o.returnAddress) && (
                      <div className="space-y-1 text-xs text-[var(--color-muted)]">
                        {o.pickupAddress && (
                          <p className="flex items-start gap-1"><MapPin className="mt-0.5 size-3 shrink-0" /><span><strong>Lấy:</strong> {o.pickupAddress.recipientName} · {formatAddressLine(o.pickupAddress)}{o.pickupAddress.phone ? ` · ${o.pickupAddress.phone}` : ''}</span></p>
                        )}
                        {o.returnAddress && (
                          <p className="flex items-start gap-1"><MapPin className="mt-0.5 size-3 shrink-0" /><span><strong>Giao:</strong> {o.returnAddress.recipientName} · {formatAddressLine(o.returnAddress)}{o.returnAddress.phone ? ` · ${o.returnAddress.phone}` : ''}</span></p>
                        )}
                        {(o.recipientPhone || o.pickupAddress?.phone) && (
                          <p>
                            <strong>SĐT:</strong>{' '}
                            <a
                              href={`tel:${o.recipientPhone || o.pickupAddress?.phone}`}
                              className="font-semibold text-brand-orange"
                            >
                              {o.recipientPhone || o.pickupAddress?.phone}
                            </a>
                          </p>
                        )}
                        {o.pickupScheduledAt && (
                          <p className="flex items-center gap-1"><Clock className="size-3" />Lấy đồ: {new Date(o.pickupScheduledAt).toLocaleString('vi')}</p>
                        )}
                        {o.desiredDeliveryAt && o.type === 'laundry' && (
                          <p className="flex items-center gap-1"><Clock className="size-3" />Giao lại: {new Date(o.desiredDeliveryAt).toLocaleString('vi')}</p>
                        )}
                      </div>
                    )}

                    {o.notes && (
                      <p className="text-xs text-[var(--color-muted)]"><strong>Ghi chú:</strong> {o.notes}</p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs">
                      <StatusBadge variant="gray">{orderTypeLabel(o.type)}</StatusBadge>
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5">{paymentMethodLabel(o.paymentMethod)} · {paymentStatusLabel(o.paymentStatus)}</span>
                    </div>

                    {o.proofs && o.proofs.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                        <p className="text-xs font-semibold text-amber-950">Biên lai chuyển khoản</p>
                        <div className="flex flex-wrap gap-2">
                          {o.proofs.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="group relative overflow-hidden rounded-lg border border-[var(--color-line)] bg-white"
                              onClick={() => setProofPreview(p.imageUrl)}
                            >
                              <img
                                src={p.imageUrl}
                                alt="Biên lai CK"
                                className="h-24 w-24 object-cover transition group-hover:opacity-90"
                              />
                              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-medium text-white">
                                Xem ảnh
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {tab === 'active' && (
                      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3 sm:flex-row sm:flex-wrap">
                        {(() => {
                          const shipBlocked =
                            o.type === 'ship_proxy' &&
                            o.status === 'accepted' &&
                            next === 'preparing' &&
                            o.paymentStatus !== 'verified' &&
                            o.paymentStatus !== 'paid';
                          if (shipBlocked) {
                            return (
                              <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                Đã nhận đơn — chờ khách chuyển khoản và duyệt biên lai rồi mới đi lấy.
                              </p>
                            );
                          }
                          return next ? (
                            <Button size="sm" className="w-full sm:w-auto" onClick={() => statusMut.mutate({ id: o.id, status: next })}>
                              → {orderStatusLabel(next, o.type)}
                            </Button>
                          ) : null;
                        })()}
                        {o.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="danger"
                            className="w-full sm:w-auto"
                            onClick={() => setConfirmAction({ type: 'reject', id: o.id, code: o.orderCode })}
                          >
                            Từ chối
                          </Button>
                        )}
                        {o.status === 'picked_up' && o.type === 'laundry' && (
                          <Button size="sm" variant="green" className="w-full sm:w-auto" onClick={() => setQuoteOrder(o.id)}>
                            Báo giá
                          </Button>
                        )}
                        {o.paymentStatus === 'proof_uploaded' && (
                          <>
                            <Button size="sm" variant="green" className="w-full sm:w-auto" onClick={() => verifyMut.mutate({ id: o.id, approved: true })}>Duyệt CK</Button>
                            <Button
                              size="sm"
                              variant="danger"
                              className="w-full sm:w-auto"
                              onClick={() => setConfirmAction({ type: 'reject_ck', id: o.id, code: o.orderCode })}
                            >
                              Từ chối CK
                            </Button>
                          </>
                        )}
                        {o.paymentMethod === 'cash' && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && (
                          <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => paidMut.mutate(o.id)}>Đã thu tiền mặt</Button>
                        )}
                      </div>
                    )}
                    {tab === 'delivering' && (
                      <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
                        <p className="text-xs text-[var(--color-muted)]">
                          {paymentMethodLabel(o.paymentMethod)}
                          {o.paymentMethod === 'cash' ? ' — thu khi giao' : ` — ${paymentStatusLabel(o.paymentStatus)}`}
                          {o.notes ? ` · Note: ${o.notes}` : ''}
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            size="sm"
                            variant="green"
                            className="w-full sm:w-auto"
                            onClick={() => statusMut.mutate({ id: o.id, status: 'completed' })}
                          >
                            Hoàn thành giao
                          </Button>
                          {o.paymentMethod === 'cash' && o.paymentStatus === 'unpaid' && (
                            <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => paidMut.mutate(o.id)}>
                              Đã thu tiền mặt
                            </Button>
                          )}
                          {o.paymentStatus === 'proof_uploaded' && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => verifyMut.mutate({ id: o.id, approved: true })}>
                              Duyệt CK
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {quoteOrder === o.id && (
                      <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
                        <Input
                          label="Tổng báo giá (đồng) *"
                          type="text"
                          inputMode="numeric"
                          placeholder="Nhập tổng tiền báo giá"
                          value={quoteFinalPrice}
                          onChange={(e) => setQuoteFinalPrice(e.target.value.replace(/[^\d]/g, ''))}
                        />
                        <Input
                          type="number"
                          label={`Số lượng thực tế (${laundryUnitLabel(o.laundry?.estimatedUnit)}) — tuỳ chọn`}
                          value={quoteQty}
                          onChange={(e) => setQuoteQty(e.target.value)}
                          placeholder="Để trống nếu không cần"
                        />
                        <Input label="Ghi chú cho khách" value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} />
                        <p className="text-xs text-[var(--color-muted)]">Nhập tổng tiền báo giá — không tự nhân đơn giá.</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => quoteMut.mutate(o.id)}
                            loading={quoteMut.isPending}
                            disabled={!quoteFinalPrice || Number(quoteFinalPrice) <= 0}
                          >
                            Gửi báo giá
                          </Button>
                          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setQuoteOrder(null)}>Huỷ</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'reject_ck' ? 'Từ chối chuyển khoản?' : 'Từ chối đơn hàng?'}
        description={
          confirmAction?.type === 'reject_ck'
            ? `Đơn ${confirmAction.code}: khách sẽ được thông báo biên lai không hợp lệ.`
            : `Đơn ${confirmAction?.code ?? ''} sẽ bị từ chối. Không hoàn tác được.`
        }
        confirmLabel={confirmAction?.type === 'reject_ck' ? 'Từ chối CK' : 'Từ chối đơn'}
        cancelLabel="Giữ lại"
        variant="danger"
        loading={statusMut.isPending || verifyMut.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'reject') {
            statusMut.mutate({ id: confirmAction.id, status: 'rejected', note: 'Quán từ chối' });
          } else {
            verifyMut.mutate({ id: confirmAction.id, approved: false });
          }
        }}
      />

      {proofPreview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setProofPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Xem biên lai chuyển khoản"
        >
          <button
            type="button"
            aria-label="Đóng"
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white text-xl font-bold text-[var(--color-ink)]"
            onClick={() => setProofPreview(null)}
          >
            ×
          </button>
          <img
            src={proofPreview}
            alt="Biên lai chuyển khoản"
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
