import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { MapPin, Clock } from 'lucide-react';
import { ordersApi, buyerApi, ApiError, type BankAccount } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice, orderStatusLabel, orderDisplayTitle, paymentStatusLabel, paymentMethodLabel, complaintStatusLabel } from '@/lib/format';
import { buildVietQrImageUrl, transferMemoLast3, bankLogoUrl } from '@/lib/vietqr';
import { OrderTimeline } from '@/components/ui/order-timeline';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { LaundryQuoteCard } from '@/components/marketplace/laundry-quote-card';
import { StatusBadge } from '@/components/ui/brand';
import { cn } from '@/lib/utils';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';
import { ImageUploader, MultiImageUploader, uploadBuyerImage } from '@/components/ui/image-uploader';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QueryErrorState } from '@/components/ui/query-state';
import { invalidateBuyerLive } from '@/hooks/use-buyer-live';

/** Khớp đúng với state machine ở backend: đơn giặt không huỷ được sau khi quán đi lấy đồ. */
const CANCELLABLE_FOOD = new Set(['pending']);
const CANCELLABLE_LAUNDRY = new Set(['pending']);

export function OrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: !!id,
    staleTime: 8_000,
    refetchOnWindowFocus: true,
  });
  const [rating, setRating] = useState(5);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [pickingBank, setPickingBank] = useState(false);
  const [complaintReason, setComplaintReason] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [complaintImages, setComplaintImages] = useState<string[]>([]);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rejectPriceOpen, setRejectPriceOpen] = useState(false);
  const reviewMut = useMutation({
    mutationFn: () => ordersApi.review(id!, { rating }),
    onSuccess: () => {
      invalidateBuyerLive(qc);
      toast('Cảm ơn bạn đã đánh giá!', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được đánh giá', 'error'),
  });
  const updateReviewMut = useMutation({
    mutationFn: () => ordersApi.updateReview(id!, { rating }),
    onSuccess: () => {
      invalidateBuyerLive(qc);
      toast('Đã cập nhật đánh giá', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được đánh giá', 'error'),
  });
  const escalateMut = useMutation({
    mutationFn: () => ordersApi.escalateComplaint(id!),
    onSuccess: (res) => {
      invalidateBuyerLive(qc);
      toast(res.message ?? 'Đã gửi lên admin', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được khiếu nại lên admin', 'error'),
  });
  const confirmMut = useMutation({
    mutationFn: () => ordersApi.confirmPrice(id!),
    onSuccess: () => {
      invalidateBuyerLive(qc);
      toast('Đã xác nhận báo giá. Cửa hàng sẽ bắt đầu giặt.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không xác nhận được báo giá', 'error'),
  });
  const rejectMut = useMutation({
    mutationFn: () => ordersApi.rejectPrice(id!),
    onSuccess: () => {
      setRejectPriceOpen(false);
      invalidateBuyerLive(qc);
      toast('Đã từ chối báo giá. Đơn hàng đã hủy.', 'info');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không từ chối được báo giá', 'error'),
  });
  const complaintMut = useMutation({
    mutationFn: () => ordersApi.complaint(id!, {
      reason: complaintReason.trim(),
      description: complaintDesc.trim(),
      evidenceUrls: complaintImages.length ? complaintImages : undefined,
    }),
    onSuccess: () => {
      setComplaintReason('');
      setComplaintDesc('');
      setComplaintImages([]);
      invalidateBuyerLive(qc);
      toast('Đã gửi khiếu nại tới người bán. Nếu cần, bạn có thể gửi tiếp lên admin.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được khiếu nại', 'error'),
  });
  const complaintReplyMut = useMutation({
    mutationFn: (body: string) => ordersApi.complaintMessage(id!, body),
    onSuccess: () => {
      invalidateBuyerLive(qc);
      toast('Đã gửi tin nhắn', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được tin nhắn', 'error'),
  });
  const cancelMut = useMutation({
    mutationFn: () => ordersApi.updateStatus(id!, 'cancelled', 'Người mua hủy đơn'),
    onSuccess: () => {
      setCancelOpen(false);
      invalidateBuyerLive(qc);
      toast('Đã hủy đơn hàng', 'info');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không hủy được đơn', 'error'),
  });
  const proofMut = useMutation({
    mutationFn: () => ordersApi.paymentProof(id!, proofUrl!),
    onSuccess: () => {
      invalidateBuyerLive(qc);
      setProofUrl(null);
      toast('Đã gửi biên lai. Chờ quán xác nhận.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được biên lai', 'error'),
  });
  const lateWarnMut = useMutation({
    mutationFn: () => ordersApi.lateDeliveryWarning(id!),
    onSuccess: (res) => {
      invalidateBuyerLive(qc);
      void qc.invalidateQueries({ queryKey: ['order', id] });
      toast(res.message ?? 'Đã gửi cảnh báo cho quán', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được cảnh báo', 'error'),
  });

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const orderPreview = data?.data?.order;
  const reviewPreview = data?.data?.review;
  const sellerId = orderPreview?.sellerId;

  useEffect(() => {
    if (reviewPreview?.rating) setRating(reviewPreview.rating);
  }, [reviewPreview?.rating]);

  const { data: bankData } = useQuery({
    queryKey: ['bank-info', sellerId],
    queryFn: () => ordersApi.bankInfo(sellerId!),
    enabled: !!sellerId && orderPreview?.paymentMethod === 'bank_transfer',
  });

  const bankAccounts: BankAccount[] = bankData?.accounts?.length
    ? bankData.accounts
    : bankData?.data
      ? [bankData.data]
      : [];
  const selectedBank =
    bankAccounts.find((a) => a.id === selectedBankId)
    ?? bankAccounts.find((a) => a.isDefault)
    ?? bankAccounts[0]
    ?? bankData?.data
    ?? null;

  useEffect(() => {
    if (!selectedBankId && bankData?.data?.id) setSelectedBankId(bankData.data.id);
  }, [bankData?.data?.id, selectedBankId]);

  if (isLoading) return <p className="py-12 text-center">Đang tải...</p>;
  if (isError || !data?.data?.order) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <QueryErrorState
          message="Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn này"
          onRetry={isError ? () => refetch() : undefined}
        />
        <p className="text-center">
          <Link to="/orders" className="text-sm font-semibold text-brand-orange-dark underline">← Về danh sách đơn hàng</Link>
        </p>
      </div>
    );
  }
  const { order, items, laundry, shipProxy, sellerContact, history, proofs, review, complaint, complaintMessages } = data.data;
  const orderTitle = orderDisplayTitle({
    ...order,
    items,
    laundry,
    shipProxy,
  });
  const foodItems = items ?? [];
  const canWarnLate = Boolean(
    order.desiredDeliveryAt
      && !order.lateDeliveryWarnedAt
      && nowMs >= new Date(order.desiredDeliveryAt).getTime() - 10 * 60 * 1000,
  );

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-8">
      <Link to="/orders" className="inline-flex text-sm font-semibold text-brand-orange-dark hover:underline">
        ← Đơn hàng của tôi
      </Link>

      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-bold leading-snug">{orderTitle}</h1>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Mã đơn: {order.orderCode}</p>
            <p className="text-xs text-[var(--color-muted)]">{new Date(order.createdAt).toLocaleString('vi')}</p>
          </div>
          <StatusBadge variant={order.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(order.status, order.type)}</StatusBadge>
        </div>
      </Card>

      {sellerContact && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold">{order.type === 'ship_proxy' ? 'Liên hệ người nhận hộ' : 'Cửa hàng'}</p>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--color-muted)]">Tên</span>
            <span className="text-right font-medium">{sellerContact.shopName || sellerContact.fullName}</span>
          </div>
          {sellerContact.phone && (
            <div className="flex justify-between gap-3">
              <span className="text-[var(--color-muted)]">SĐT</span>
              <a href={`tel:${sellerContact.phone}`} className="font-semibold text-brand-orange">{sellerContact.phone}</a>
            </div>
          )}
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm font-bold">Theo dõi đơn hàng</p>
        <OrderTimeline type={order.type} status={order.status} />
      </Card>

      {order.type === 'food' && foodItems.length > 0 && (
        <Card className="space-y-3">
          <p className="font-semibold">Chi tiết món</p>
          <ul className="divide-y divide-[var(--color-line)]">
            {foodItems.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium">{item.itemName} ×{item.quantity}</p>
                  {!!item.options?.length && (
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {item.options.map((o) => o.name).join(', ')}
                    </p>
                  )}
                  {item.note && (
                    <p className="mt-0.5 text-xs italic text-[var(--color-muted)]">Ghi chú: {item.note}</p>
                  )}
                </div>
                <span className="shrink-0 font-semibold text-brand-orange">{formatPrice(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {order.type === 'food' && (order.deliveryAddress || order.recipientPhone || order.recipientName) && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold">Giao tới</p>
          {(order.recipientName || order.deliveryAddress?.recipientName) && (
            <p className="font-medium">{order.recipientName || order.deliveryAddress?.recipientName}</p>
          )}
          {order.deliveryAddress && (
            <p className="flex items-start gap-1.5 text-[var(--color-muted)]">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              {formatAddressLine(order.deliveryAddress)}
            </p>
          )}
          {(order.recipientPhone || order.deliveryAddress?.phone) && (
            <p>
              <span className="text-[var(--color-muted)]">SĐT: </span>
              <a
                href={`tel:${order.recipientPhone || order.deliveryAddress?.phone}`}
                className="font-semibold text-brand-orange"
              >
                {order.recipientPhone || order.deliveryAddress?.phone}
              </a>
            </p>
          )}
          {order.desiredDeliveryAt && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <Clock className="size-3.5" />
              Mong muốn giao: {new Date(order.desiredDeliveryAt).toLocaleString('vi')}
            </p>
          )}
          {order.type === 'food'
            && order.desiredDeliveryAt
            && !['completed', 'cancelled', 'rejected', 'needs_support'].includes(order.status) && (
            <div className="border-t border-[var(--color-line)] pt-2">
              {order.lateDeliveryWarnedAt ? (
                <p className="text-xs text-amber-800">
                  Đã gửi cảnh báo trễ đơn lúc {new Date(order.lateDeliveryWarnedAt).toLocaleString('vi')}
                </p>
              ) : canWarnLate ? (
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-amber-300 text-amber-900 sm:w-auto"
                    loading={lateWarnMut.isPending}
                    onClick={() => lateWarnMut.mutate()}
                  >
                    Cảnh báo trễ đơn
                  </Button>
                  <p className="text-[11px] leading-snug text-[var(--color-muted)]">
                    Hiện từ 10 phút trước giờ giao nếu bạn chưa nhận được cuộc gọi giao hàng — nhắc quán xử lý gấp.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-[var(--color-muted)]">
                  Nút cảnh báo trễ đơn sẽ hiện từ 10 phút trước giờ giao nếu bạn chưa được gọi.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {order.notes && (
        <Card className="text-sm">
          <p className="font-semibold">Ghi chú đơn</p>
          <p className="mt-1 text-[var(--color-muted)]">{order.notes}</p>
        </Card>
      )}

      <Card className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Thanh toán</span><span>{paymentMethodLabel(order.paymentMethod)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Trạng thái TT</span><StatusBadge variant={order.paymentStatus === 'verified' || order.paymentStatus === 'paid' ? 'green' : 'orange'}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge></div>
        {order.subtotal != null && Number(order.subtotal) !== Number(order.total) && (
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Tạm tính</span><span>{formatPrice(order.subtotal)}</span></div>
        )}
        <div className="flex justify-between font-semibold"><span>Tổng</span><span className="text-brand-orange">{formatPrice(order.total)}</span></div>
      </Card>
      {order.paymentMethod === 'bank_transfer' && selectedBank && order.paymentStatus !== 'verified' && order.paymentStatus !== 'paid' && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold">Thông tin chuyển khoản</p>
          {order.status === 'pending' ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
              {order.type === 'ship_proxy'
                ? 'Người nhận hộ chưa xác nhận. Sau khi họ nhận đơn, bạn chuyển khoản ngay rồi gửi biên lai.'
                : 'Quán chưa xác nhận đơn. Sau khi quán nhận đơn, bạn mới chuyển khoản và gửi biên lai.'}
            </p>
          ) : (
            <>
          {order.type === 'ship_proxy' && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
              Chuyển khoản ngay để người nhận hộ đi lấy hàng. Gửi biên lai bên dưới.
            </p>
          )}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2.5">
              {bankLogoUrl(selectedBank.bankName) && (
                <img
                  src={bankLogoUrl(selectedBank.bankName)!}
                  alt=""
                  className="mt-0.5 size-8 shrink-0 rounded-md bg-white object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="min-w-0">
                <p className="font-medium">
                  {selectedBank.bankName} · {selectedBank.accountNumber}
                  {selectedBank.isDefault && (
                    <span className="ml-1.5 text-[11px] font-semibold text-brand-orange">Mặc định</span>
                  )}
                </p>
                <p className="text-[var(--color-muted)]">{selectedBank.accountHolder}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {bankAccounts.length > 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPickingBank((v) => !v)}
                >
                  {pickingBank ? 'Đóng' : 'Đổi ngân hàng'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedBank.accountNumber);
                  toast('Đã copy số tài khoản', 'success');
                }}
              >
                Copy STK
              </Button>
            </div>
          </div>
          {pickingBank && bankAccounts.length > 1 && (
            <div className="space-y-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
              <p className="px-1 text-[11px] font-medium text-[var(--color-muted)]">Chọn tài khoản nhận</p>
              {bankAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setSelectedBankId(acc.id);
                    setPickingBank(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    acc.id === selectedBank.id ? 'bg-sky-50 ring-1 ring-brand-orange/30' : 'hover:bg-white',
                  )}
                >
                  {bankLogoUrl(acc.bankName) && (
                    <img
                      src={bankLogoUrl(acc.bankName)!}
                      alt=""
                      className="mt-0.5 size-7 shrink-0 rounded-md bg-white object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{acc.bankName}</span>
                    {acc.isDefault && (
                      <span className="ml-1 text-[10px] font-bold uppercase text-brand-orange">Mặc định</span>
                    )}
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                      {acc.accountNumber} · {acc.accountHolder}
                    </span>
                  </span>
                  {acc.id === selectedBank.id && (
                    <span className="shrink-0 text-[11px] font-semibold text-brand-orange">Đang chọn</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {(() => {
            const phone =
              order.recipientPhone
              || order.deliveryAddress?.phone
              || null;
            const transferMemo = transferMemoLast3(phone, order.orderCode);
            const vietQr = buildVietQrImageUrl({
              bankName: selectedBank.bankName,
              accountNumber: selectedBank.accountNumber,
              accountHolder: selectedBank.accountHolder,
              amount: order.total,
              addInfo: transferMemo,
              template: 'compact',
            });
            const qrSrc = vietQr || selectedBank.qrImageUrl || null;
            if (!qrSrc) return null;
            return (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
                <img
                  src={qrSrc}
                  alt="QR chuyển khoản"
                  className="size-24 shrink-0 rounded-lg border border-[var(--color-line)] bg-white object-contain"
                />
                <div className="min-w-0 text-xs text-[var(--color-muted)]">
                  <p className="font-semibold text-[var(--color-ink)]">Quét QR để CK nhanh</p>
                  <p className="mt-0.5">Số tiền: <span className="font-semibold text-brand-orange">{formatPrice(order.total)}</span></p>
                  <p className="mt-0.5">
                    Nội dung:{' '}
                    <span className="font-medium text-[var(--color-ink)]">{transferMemo}</span>
                    <span className="text-[var(--color-muted)]"> (3 số đuôi SĐT)</span>
                  </p>
                  {vietQr && <p className="mt-1 text-[10px]">Mở app ngân hàng → quét mã</p>}
                </div>
              </div>
            );
          })()}
          {proofs.length === 0 && order.status !== 'cancelled' && order.status !== 'rejected' && (
            <>
              <ImageUploader
                label="Ảnh biên lai chuyển khoản"
                value={proofUrl}
                onChange={setProofUrl}
                onUpload={(file) => uploadBuyerImage(buyerApi.uploadImage, file, id!)}
              />
              <Button size="sm" onClick={() => proofMut.mutate()} loading={proofMut.isPending} disabled={!proofUrl}>
                Gửi biên lai
              </Button>
            </>
          )}
          {proofs.map((p) => (
            <div key={p.id} className="space-y-1">
              <img src={p.imageUrl} alt="Biên lai" className="max-h-32 rounded-lg border border-[var(--color-line)] object-cover" />
              <p className="text-xs text-[var(--color-muted)]">
                Trạng thái: {paymentStatusLabel(p.status)}{p.rejectionReason ? ` — ${p.rejectionReason}` : ''}
              </p>
            </div>
          ))}
            </>
          )}
        </Card>
      )}
      {CANCELLABLE_FOOD.has(order.status) && (order.type === 'food' || order.type === 'ship_proxy') && (
        <Card>
          <p className="mb-2 text-sm text-[var(--color-muted)]">Bạn chỉ có thể hủy khi quán chưa nhận đơn.</p>
          <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>Hủy đơn hàng</Button>
        </Card>
      )}
      {CANCELLABLE_LAUNDRY.has(order.status) && order.type === 'laundry' && (
        <Card>
          <p className="mb-2 text-sm text-[var(--color-muted)]">Bạn chỉ có thể hủy trước khi cửa hàng xác nhận.</p>
          <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>Hủy đặt giặt</Button>
        </Card>
      )}
      <ConfirmDialog
        open={cancelOpen}
        title="Xác nhận hủy đơn?"
        description="Đơn sẽ bị hủy và không thể hoàn tác. Nếu đã thanh toán chuyển khoản, liên hệ quán để được hỗ trợ."
        confirmLabel="Hủy đơn"
        cancelLabel="Giữ đơn"
        variant="danger"
        loading={cancelMut.isPending}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => cancelMut.mutate()}
      />
      <ConfirmDialog
        open={rejectPriceOpen}
        title="Từ chối báo giá?"
        description="Đơn sẽ bị hủy. Bạn có thể đặt lại sau nếu cần."
        confirmLabel="Từ chối"
        cancelLabel="Giữ đơn"
        variant="danger"
        loading={rejectMut.isPending}
        onCancel={() => setRejectPriceOpen(false)}
        onConfirm={() => rejectMut.mutate()}
      />
      {!!shipProxy && order.type === 'ship_proxy' && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold">Chi tiết nhận đồ ship hộ</p>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Số shipper</span><span className="text-right font-medium">{shipProxy.trackingCode}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Vị trí lấy</span><span className="text-right">{shipProxy.pickupLocation}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Giờ lấy</span><span>{new Date(shipProxy.pickupAt).toLocaleString('vi')}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">SĐT nhận đơn hàng</span><span>{shipProxy.receivePhone}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Giờ nhận lại</span><span>{new Date(shipProxy.returnAt).toLocaleString('vi')}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Địa chỉ nhận lại</span><span className="text-right">{shipProxy.returnAddressText}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">SĐT của bạn</span><span>{shipProxy.contactPhone}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Giá tiền hàng</span><span className="font-semibold">{formatPrice(shipProxy.packageValue ?? 0)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">Phí nhận hộ</span><span className="font-semibold text-brand-orange">{formatPrice(order.total)}</span></div>
        </Card>
      )}
      {!!laundry && order.type === 'laundry' && (
        <LaundryQuoteCard
          laundry={laundry}
          order={order}
          onConfirm={() => confirmMut.mutate()}
          onReject={() => setRejectPriceOpen(true)}
          confirmLoading={confirmMut.isPending}
          rejectLoading={rejectMut.isPending}
        />
      )}
      {order.type === 'laundry' && (order.pickupAddress || order.returnAddress) && (
        <Card className="space-y-3 text-sm">
          <p className="font-semibold">Địa chỉ</p>
          {order.pickupAddress && (
            <div>
              <p className="text-xs font-medium text-[var(--color-muted)]">Lấy đồ</p>
              <p className="font-medium">{order.pickupAddress.recipientName}</p>
              <p className="text-[var(--color-muted)]">{formatAddressLine(order.pickupAddress)}</p>
            </div>
          )}
          {order.returnAddress && (
            <div>
              <p className="text-xs font-medium text-[var(--color-muted)]">Giao lại</p>
              <p className="font-medium">{order.returnAddress.recipientName}</p>
              <p className="text-[var(--color-muted)]">{formatAddressLine(order.returnAddress)}</p>
            </div>
          )}
          {order.pickupScheduledAt && (
            <p className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <Clock className="size-3.5" />
              Lấy đồ: {new Date(order.pickupScheduledAt).toLocaleString('vi')}
            </p>
          )}
          {order.desiredDeliveryAt && (
            <p className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <Clock className="size-3.5" />
              Giao lại: {new Date(order.desiredDeliveryAt).toLocaleString('vi')}
            </p>
          )}
        </Card>
      )}
      {order.status === 'waiting_price_confirmation' && !laundry && (
        <Card>
          <p className="mb-2 text-sm">Cửa hàng đã báo giá. Xác nhận?</p>
          <div className="flex gap-2">
            <Button variant="green" size="sm" onClick={() => confirmMut.mutate()} loading={confirmMut.isPending}>Xác nhận</Button>
            <Button variant="outline" size="sm" onClick={() => setRejectPriceOpen(true)}>Từ chối</Button>
          </div>
        </Card>
      )}
      {order.status === 'completed' && (
        <>
          {!review ? (
            <Card>
              <p className="font-semibold mb-2">Đánh giá</p>
              <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Chấm điểm đơn hàng">{[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={s === rating}
                  aria-label={`${s} sao`}
                  onClick={() => setRating(s)}
                  className={cn(
                    'grid size-11 place-items-center rounded-lg text-2xl transition-colors',
                    s <= rating ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300',
                  )}
                >★</button>
              ))}</div>
              <Button size="sm" loading={reviewMut.isPending} onClick={() => reviewMut.mutate()}>Gửi đánh giá</Button>
            </Card>
          ) : (
            <Card className="space-y-2 text-sm">
              <p className="font-semibold">Đánh giá của bạn</p>
              <div className="mb-1 flex gap-1" role="radiogroup" aria-label="Sửa điểm đánh giá">{[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={s === rating}
                  aria-label={`${s} sao`}
                  onClick={() => setRating(s)}
                  className={cn(
                    'grid size-11 place-items-center rounded-lg text-2xl transition-colors',
                    s <= rating ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300',
                  )}
                >★</button>
              ))}</div>
              <p className="text-xs text-[var(--color-muted)]">Hiện tại: {'★'.repeat(review.rating)}</p>
              <Button
                size="sm"
                variant="outline"
                loading={updateReviewMut.isPending}
                disabled={rating === review.rating}
                onClick={() => updateReviewMut.mutate()}
              >
                Cập nhật đánh giá
              </Button>
            </Card>
          )}
          {!complaint ? (
            <Card>
              <p className="font-semibold mb-2">Khiếu nại tới người bán</p>
              <p className="mb-2 text-xs text-[var(--color-muted)]">Gửi cho quán trước. Nếu chưa ổn, bạn có thể gửi tiếp lên admin.</p>
              <Input label="Lý do ngắn" value={complaintReason} onChange={(e) => setComplaintReason(e.target.value)} placeholder="Ví dụ: Giao sai món" />
              {complaintReason.trim().length > 0 && complaintReason.trim().length < 3 && (
                <p className="mt-1 text-xs text-red-600">Lý do cần tối thiểu 3 ký tự</p>
              )}
              <textarea
                value={complaintDesc}
                onChange={(e) => setComplaintDesc(e.target.value)}
                placeholder="Mô tả chi tiết vấn đề..."
                rows={3}
                className="mt-2 w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm"
              />
              <p className={cn('mt-1 text-xs', complaintDesc.trim().length < 10 ? 'text-red-600' : 'text-[var(--color-muted)]')}>
                {complaintDesc.trim().length < 10
                  ? `Mô tả cần thêm ${10 - complaintDesc.trim().length} ký tự (tối thiểu 10)`
                  : `${complaintDesc.trim().length} ký tự`}
              </p>
              <div className="mt-3">
                <MultiImageUploader
                  label="Đính kèm ảnh minh chứng (tuỳ chọn, tối đa 10)"
                  value={complaintImages}
                  onChange={setComplaintImages}
                  onUpload={(file) => uploadBuyerImage(buyerApi.uploadImage, file, id!)}
                  max={10}
                />
              </div>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => complaintMut.mutate()}
                disabled={complaintReason.trim().length < 3 || complaintDesc.trim().length < 10}
                loading={complaintMut.isPending}
              >
                Gửi tới người bán
              </Button>
            </Card>
          ) : (
            <Card className="space-y-3">
              <p className="mb-1 font-semibold">Khiếu nại</p>
              <StatusBadge variant={complaint.status === 'resolved' ? 'green' : complaint.status === 'rejected' ? 'red' : 'orange'}>
                {complaintStatusLabel(complaint.status)}
              </StatusBadge>
              <ComplaintThread
                complaint={complaint}
                messages={complaintMessages ?? []}
                viewerRole="buyer"
                onSend={(body) => complaintReplyMut.mutateAsync(body)}
                sending={complaintReplyMut.isPending}
              />
              {['waiting_seller', 'processing'].includes(complaint.status) && (
                <Button size="sm" variant="outline" loading={escalateMut.isPending} onClick={() => escalateMut.mutate()}>
                  Gửi lên admin
                </Button>
              )}
            </Card>
          )}
        </>
      )}
      <Card>
        <p className="font-semibold mb-2 text-sm">Lịch sử</p>
        {(history as { toStatus: string; createdAt: string }[])?.map((h, i) => (
          <p key={i} className="text-xs text-[var(--color-muted)]">{new Date(h.createdAt).toLocaleString('vi')} → {orderStatusLabel(h.toStatus, order.type)}</p>
        ))}
      </Card>
    </div>
  );
}
