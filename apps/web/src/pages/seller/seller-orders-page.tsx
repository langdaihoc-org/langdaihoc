import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ApiError, type Order, type PaymentProof } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { orderStatusLabel, formatPrice, orderTypeLabel, orderDisplayTitle, laundryUnitLabel, formatDateTimeVi, formatDeliveryWish } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, User, MapPin, ArrowUpDown, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  NEXT_STATUS,
  SELLER_ACTIVE,
  HIDDEN_ORDER,
  paymentMethodLabel,
  paymentStatusLabel,
  type DeliverSort,
  DELIVER_SORT_OPTIONS,
  sortDeliveringOrders,
  refreshSellerOrderMeta,
} from './seller-shared';

const PAGE_SIZE = 20;

type OrderTab = 'active' | 'delivering' | 'done';

function tabForStatus(status: string): OrderTab | 'hidden' {
  if (HIDDEN_ORDER.has(status)) return 'hidden';
  if (status === 'delivering' || status === 'returning') return 'delivering';
  if (status === 'completed') return 'done';
  if (SELLER_ACTIVE.has(status)) return 'active';
  return 'hidden';
}

export function SellerOrdersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<OrderTab>('active');
  const [deliverSort, setDeliverSort] = useState<DeliverSort>('time');
  const [page, setPage] = useState(1);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ active: 0, delivering: 0, done: 0 });
  const { data, isLoading, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['seller-orders', tab, page],
    queryFn: () => ordersApi.list(page, PAGE_SIZE, { scope: tab, view: 'summary' }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!data) return;
    setAllOrders((prev) => {
      if (page === 1) return data.data;
      const existing = new Set(prev.map((o) => o.id));
      const fresh = data.data.filter((o) => !existing.has(o.id));
      return [...prev, ...fresh];
    });
    setHasMore(data.meta?.hasMore ?? false);
    if (data.meta?.counts) {
      setCounts({
        active: data.meta.counts.active ?? 0,
        delivering: data.meta.counts.delivering ?? 0,
        done: data.meta.counts.done ?? 0,
      });
    }
  }, [data, page]);

  const handleTabChange = (next: OrderTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setAllOrders([]);
    setHasMore(false);
  };

  /** Cập nhật UI tại chỗ — đơn rời tab hiện tại thì biến mất khỏi list, badge đổi ngay. */
  const applyLocalOrderUpdate = (orderId: string, patch: Partial<Order>) => {
    const cur = allOrders.find((o) => o.id === orderId);
    if (!cur) return;
    const next = { ...cur, ...patch };
    const dest = tabForStatus(next.status);
    const leavesTab = dest !== tab;

    setAllOrders((prev) => {
      if (!prev.some((o) => o.id === orderId)) return prev;
      if (leavesTab) return prev.filter((o) => o.id !== orderId);
      return prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o));
    });

    if (leavesTab) {
      setCounts((c) => ({
        ...c,
        [tab]: Math.max(0, c[tab] - 1),
        ...(dest === 'active' || dest === 'delivering' || dest === 'done'
          ? { [dest]: c[dest] + 1 }
          : {}),
      }));
    }
  };

  const [quoteOrder, setQuoteOrder] = useState<string | null>(null);
  const [quoteFinalPrice, setQuoteFinalPrice] = useState('');
  const [quoteQty, setQuoteQty] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | {
    type: 'reject' | 'reject_ck' | 'cancel_quote';
    id: string;
    code: string;
    orderType?: string;
  }>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  // Lazy proof fetch: map orderId -> proofs (null = chưa fetch, [] = đang fetch)
  const [lazyProofs, setLazyProofs] = useState<Map<string, PaymentProof[] | 'loading'>>(new Map());

  const fetchAndShowProofs = async (orderId: string) => {
    const existing = lazyProofs.get(orderId);
    if (existing === 'loading') return;
    if (Array.isArray(existing) && existing.length > 0) {
      setProofPreview(existing[0].imageUrl);
      return;
    }
    setLazyProofs((prev) => new Map(prev).set(orderId, 'loading'));
    try {
      const res = await ordersApi.get(orderId);
      const proofs = res.data.proofs ?? [];
      setLazyProofs((prev) => new Map(prev).set(orderId, proofs));
      if (proofs.length > 0) setProofPreview(proofs[0].imageUrl);
    } catch {
      setLazyProofs((prev) => { const next = new Map(prev); next.delete(orderId); return next; });
    }
  };
  const statusMut = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      ordersApi.updateStatus(id, status, note),
    onSuccess: (res, vars) => {
      const updated = res?.data;
      applyLocalOrderUpdate(vars.id, {
        status: updated?.status ?? vars.status,
        ...(updated?.paymentStatus ? { paymentStatus: updated.paymentStatus } : {}),
        ...(updated?.total != null ? { total: updated.total } : {}),
      });
      refreshSellerOrderMeta(qc);
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
    onSuccess: (res, id) => {
      const updated = res?.data;
      applyLocalOrderUpdate(id, {
        status: updated?.status ?? 'waiting_price_confirmation',
        ...(updated?.total != null ? { total: updated.total } : {}),
      });
      refreshSellerOrderMeta(qc);
      setQuoteOrder(null);
      setQuoteFinalPrice('');
      setQuoteQty('');
      setQuoteNote('');
      toast(
        updated?.status === 'washing'
          ? 'Đã báo giá và tự chuyển sang đang giặt'
          : 'Đã gửi báo giá — chờ khách xác nhận',
        'success',
      );
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được báo giá', 'error'),
  });
  const verifyMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => ordersApi.verifyPayment(id, approved),
    onSuccess: (_res, vars) => {
      applyLocalOrderUpdate(vars.id, {
        paymentStatus: vars.approved ? 'verified' : 'rejected',
      });
      refreshSellerOrderMeta(qc);
      setConfirmAction(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được thanh toán', 'error'),
  });
  const paidMut = useMutation({
    mutationFn: (id: string) => ordersApi.markPaid(id),
    onSuccess: (_res, id) => {
      applyLocalOrderUpdate(id, { paymentStatus: 'paid' });
      refreshSellerOrderMeta(qc);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không đánh dấu đã thu tiền', 'error'),
  });

  // API đã lọc theo scope tab — chỉ ẩn cancelled/rejected nếu lọt vào.
  const orders = useMemo(() => {
    const filtered = allOrders.filter((o) => !HIDDEN_ORDER.has(o.status));
    if (tab === 'delivering') return sortDeliveringOrders(filtered, deliverSort);
    return filtered;
  }, [allOrders, tab, deliverSort]);

  const showInitialLoading = isLoading && allOrders.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h1 className="font-bold">Quản lý đơn hàng</h1>
        <p className="text-[11px] text-[var(--color-muted)]">
          {dataUpdatedAt
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
              onClick={() => handleTabChange(id)}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors',
                tab === id ? 'border-b-2 border-brand-green text-brand-green' : 'text-[var(--color-muted)]',
              )}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {tab === 'delivering' && !showInitialLoading && orders.length > 0 && (
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

        {showInitialLoading ? (
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
                      <span className="flex items-center gap-1"><Clock className="size-3" />{formatDateTimeVi(o.createdAt)}</span>
                      {o.buyerName && <span className="flex items-center gap-1"><User className="size-3" />{o.buyerName}</span>}
                      <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
                    </div>

                    {o.lateDeliveryWarnedAt && (
                      <p className="rounded-xl border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950">
                        Khách cảnh báo trễ đơn · chưa được gọi giao
                        <span className="mt-0.5 block font-normal text-amber-950/80">
                          {formatDateTimeVi(o.lateDeliveryWarnedAt)}
                        </span>
                      </p>
                    )}

                    {o.complaint && !['resolved', 'rejected'].includes(o.complaint.status) && (
                      <Link
                        to="/seller/complaints"
                        className="block rounded-xl border border-amber-400 bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950"
                      >
                        Khiếu nại từ khách · {o.complaint.reason}
                        <span className="mt-0.5 block font-normal text-amber-950/80">
                          {formatDateTimeVi(o.complaint.createdAt)}
                        </span>
                      </Link>
                    )}

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
                            Mong muốn: {formatDeliveryWish(o.desiredDeliveryAt, o.desiredDeliveryUntil)}
                          </p>
                        )}
                      </div>
                    )}

                    {o.type === 'laundry' && o.laundry && (
                      <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-sm">
                        <p className="font-medium">{o.laundry.serviceName}</p>
                        {o.laundry.autoConfirmQuote && (
                          <p className="text-xs text-brand-green">Khách đã chọn tự xác nhận báo giá</p>
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
                        <p><span className="text-[var(--color-muted)]">Giờ lấy:</span> {formatDateTimeVi(o.shipProxy.pickupAt)}</p>
                        <p><span className="text-[var(--color-muted)]">SĐT nhận đơn hàng:</span> {o.shipProxy.receivePhone}</p>
                        <p><span className="text-[var(--color-muted)]">Giao lại:</span> {o.shipProxy.returnAddressText}</p>
                        <p><span className="text-[var(--color-muted)]">Giờ giao lại:</span> {formatDateTimeVi(o.shipProxy.returnAt)}</p>
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
                          <span className="font-semibold">{formatPrice(
                            (() => {
                              const pkg = Number(o.shipProxy.packageValue ?? 0);
                              const total = Number(o.total);
                              return total >= pkg && pkg > 0 ? total - pkg : total;
                            })(),
                          )}</span>
                        </p>
                        <p>
                          <span className="text-[var(--color-muted)]">Tổng thanh toán:</span>{' '}
                          <span className="font-semibold text-brand-orange">{formatPrice(o.total)}</span>
                        </p>
                        <p className="text-[11px] text-[var(--color-muted)]">Ghi chú: tổng = giá hàng + phí nhận hộ.</p>
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
                          <p className="flex items-center gap-1"><Clock className="size-3" />Lấy đồ: {formatDateTimeVi(o.pickupScheduledAt)}</p>
                        )}
                        {o.desiredDeliveryAt && o.type === 'laundry' && (
                          <p className="flex items-center gap-1"><Clock className="size-3" />Giao lại: {formatDateTimeVi(o.desiredDeliveryAt)}</p>
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

                    {o.paymentMethod === 'bank_transfer'
                      && ['proof_uploaded', 'verified', 'rejected', 'paid'].includes(o.paymentStatus)
                      && (() => {
                      const proofState = lazyProofs.get(o.id);
                      const loading = proofState === 'loading';
                      const fetched = Array.isArray(proofState) ? proofState : null;
                      return (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <p className="mb-2 text-xs font-semibold text-amber-950">Biên lai chuyển khoản</p>
                          {fetched && fetched.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {fetched.map((p) => (
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
                          ) : (
                            <button
                              type="button"
                              disabled={loading}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
                              onClick={() => fetchAndShowProofs(o.id)}
                            >
                              {loading ? 'Đang tải…' : 'Xem biên lai'}
                            </button>
                          )}
                        </div>
                      );
                    })()}

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
                            onClick={() =>
                              setConfirmAction({
                                type: 'reject',
                                id: o.id,
                                code: o.orderCode,
                                orderType: o.type,
                              })
                            }
                          >
                            Từ chối
                          </Button>
                        )}
                        {o.status === 'waiting_price_confirmation' && o.type === 'laundry' && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              onClick={() =>
                                statusMut.mutate({
                                  id: o.id,
                                  status: 'needs_support',
                                  note: 'Seller báo cần hỗ trợ — khách chưa phản hồi báo giá',
                                })
                              }
                            >
                              Báo cần hỗ trợ
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              className="w-full sm:w-auto"
                              onClick={() =>
                                setConfirmAction({
                                  type: 'cancel_quote',
                                  id: o.id,
                                  code: o.orderCode,
                                  orderType: o.type,
                                })
                              }
                            >
                              Hủy (không phản hồi)
                            </Button>
                          </>
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
                      </div>
                    )}
                    {tab === 'delivering' && (
                      <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
                        <p className="text-xs text-[var(--color-muted)]">
                          {paymentMethodLabel(o.paymentMethod)}
                          {o.paymentMethod === 'cash' ? ' — thu khi giao' : ` — ${paymentStatusLabel(o.paymentStatus)}`}
                          {o.notes ? ` · Note: ${o.notes}` : ''}
                        </p>
                        {(() => {
                          const paymentOk =
                            o.paymentStatus === 'verified' || o.paymentStatus === 'paid';
                          return (
                            <>
                              {!paymentOk && (
                                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                  {o.paymentMethod === 'cash'
                                    ? 'Cần thu tiền mặt trước rồi mới hoàn thành giao.'
                                    : 'Cần duyệt chuyển khoản trước rồi mới hoàn thành giao.'}
                                </p>
                              )}
                              <div className="flex flex-col gap-2 sm:flex-row">
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
                                <Button
                                  size="sm"
                                  variant="green"
                                  className="w-full sm:w-auto"
                                  disabled={!paymentOk}
                                  onClick={() => statusMut.mutate({ id: o.id, status: 'completed' })}
                                >
                                  Hoàn thành giao
                                </Button>
                              </div>
                            </>
                          );
                        })()}
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
        {!showInitialLoading && hasMore && (
          <div className="border-t border-[var(--color-line)] px-4 py-3 text-center">
            <button
              type="button"
              disabled={isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="text-sm font-semibold text-brand-green disabled:opacity-50"
            >
              {isFetching ? 'Đang tải…' : 'Xem thêm'}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'reject_ck'
            ? 'Từ chối chuyển khoản?'
            : confirmAction?.type === 'cancel_quote'
              ? 'Hủy đơn chờ xác nhận giá?'
              : 'Từ chối đơn hàng?'
        }
        description={
          confirmAction?.type === 'reject_ck'
            ? `Đơn ${confirmAction.code}: khách sẽ được thông báo biên lai không hợp lệ.`
            : confirmAction?.type === 'cancel_quote'
              ? `Đơn ${confirmAction?.code ?? ''}: khách chưa xác nhận báo giá. Đơn sẽ bị hủy.`
              : `Đơn ${confirmAction?.code ?? ''} sẽ bị từ chối. Không hoàn tác được.`
        }
        confirmLabel={
          confirmAction?.type === 'reject_ck'
            ? 'Từ chối CK'
            : confirmAction?.type === 'cancel_quote'
              ? 'Hủy đơn'
              : 'Từ chối đơn'
        }
        cancelLabel="Giữ lại"
        variant="danger"
        loading={statusMut.isPending || verifyMut.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'reject') {
            const status = confirmAction.orderType === 'laundry' ? 'cancelled' : 'rejected';
            statusMut.mutate({
              id: confirmAction.id,
              status,
              note: confirmAction.orderType === 'laundry' ? 'Quán từ chối đơn giặt' : 'Quán từ chối',
            });
          } else if (confirmAction.type === 'cancel_quote') {
            statusMut.mutate({
              id: confirmAction.id,
              status: 'cancelled',
              note: 'Hủy — khách không phản hồi báo giá',
            });
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
