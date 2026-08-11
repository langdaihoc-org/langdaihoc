import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ordersApi, sellerApi, type Order } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

/** Pulse nhẹ → chỉ tải full list khi fingerprint đổi (tránh quá tải). */
export function useSellerOrdersLive(opts?: { notifyNew?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const prevSig = useRef<string | null>(null);
  const prevPending = useRef<number | null>(null);
  const prevLateWarning = useRef<number | null>(null);

  const pulseQuery = useQuery({
    queryKey: ['seller-orders-pulse'],
    queryFn: () => ordersApi.pulse(),
    refetchInterval: (q) => {
      const pending = q.state.data?.data?.pendingCount ?? 0;
      const late = q.state.data?.data?.lateWarningCount ?? 0;
      const complaints = q.state.data?.data?.openComplaintCount ?? 0;
      // Có đơn chờ / cảnh báo / khiếu nại → poll mau hơn
      return pending > 0 || late > 0 || complaints > 0 ? 5_000 : 15_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 4_000,
  });

  useEffect(() => {
    const pulse = pulseQuery.data?.data;
    if (!pulse) return;
    const sig = `${pulse.pendingCount}|${pulse.openCount}|${pulse.lateWarningCount ?? 0}|${pulse.openComplaintCount ?? 0}|${pulse.latestCreatedAt}|${pulse.latestUpdatedAt}|${pulse.latestLateWarningAt ?? ''}|${pulse.latestComplaintAt ?? ''}|${pulse.unreadNotifications ?? 0}|${pulse.latestNotificationAt ?? ''}`;
    if (prevSig.current == null) {
      prevSig.current = sig;
      prevPending.current = pulse.pendingCount;
      prevLateWarning.current = pulse.lateWarningCount ?? 0;
      return;
    }
    if (prevSig.current !== sig) {
      prevSig.current = sig;
      void qc.invalidateQueries({ queryKey: ['seller-orders'] });
      void qc.invalidateQueries({ queryKey: ['seller-complaints'] });
      void qc.invalidateQueries({ queryKey: ['seller-notifications'] });
      if (opts?.notifyNew && prevPending.current != null && pulse.pendingCount > prevPending.current) {
        const n = pulse.pendingCount - prevPending.current;
        toast(n === 1 ? 'Có đơn mới cần xử lý' : `${n} đơn mới cần xử lý`, 'success');
      }
      prevPending.current = pulse.pendingCount;
      const late = pulse.lateWarningCount ?? 0;
      if (opts?.notifyNew && prevLateWarning.current != null && late > prevLateWarning.current) {
        toast('Khách cảnh báo trễ đơn — kiểm tra đơn sắp tới giờ giao', 'error');
      }
      prevLateWarning.current = late;
    }
  }, [pulseQuery.data?.data, qc, toast, opts?.notifyNew]);
}

export function invalidateSellerOrders(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['seller-orders'] });
  void qc.invalidateQueries({ queryKey: ['seller-orders-pulse'] });
}

/** Chỉ refresh badge/pulse — không xóa list đang xem (tránh giật khi bấm nút). */
export function refreshSellerOrderMeta(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['seller-orders-pulse'] });
  void qc.invalidateQueries({ queryKey: ['seller-orders', 'summary'] });
}

export const NEXT_STATUS: Record<string, Record<string, string>> = {
  food: { pending: 'accepted', accepted: 'preparing', preparing: 'delivering', delivering: 'completed' },
  ship_proxy: { pending: 'accepted', accepted: 'preparing', preparing: 'picked_up', picked_up: 'delivering', delivering: 'completed' },
  // picked_up không có bước kế tiếp: quán phải gửi báo giá, khách chốt giá mới sang washing.
  laundry: { pending: 'accepted', accepted: 'picking_up', picking_up: 'picked_up', washing: 'returning', returning: 'completed' },
};

export const SELLER_ACTIVE = new Set([
  'pending', 'accepted', 'preparing', 'delivering',
  'picking_up', 'picked_up', 'waiting_price_confirmation', 'washing', 'returning',
]);
export const SELLER_DONE = new Set(['completed']);
export const HIDDEN_ORDER = new Set(['cancelled', 'rejected', 'needs_support']);

export function paymentMethodLabel(method: string) {
  return method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
}

export function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    unpaid: 'Chưa thanh toán',
    proof_uploaded: 'Chờ duyệt CK',
    verified: 'Đã xác nhận CK',
    paid: 'Đã thanh toán',
  };
  return map[status] ?? status;
}

export type DeliverSort = 'time' | 'oldest';

export const DELIVER_SORT_OPTIONS: { id: DeliverSort; label: string }[] = [
  { id: 'time', label: 'Giờ giao sớm' },
  { id: 'oldest', label: 'Đơn cũ trước' },
];

export function deliveryDueAt(o: Order): number {
  const raw =
    o.desiredDeliveryAt ??
    (o.type === 'ship_proxy' ? o.shipProxy?.returnAt : null) ??
    (o.type === 'laundry' ? o.pickupScheduledAt : null);
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function sortDeliveringOrders(list: Order[], sort: DeliverSort): Order[] {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sort === 'time') {
      const byDue = deliveryDueAt(a) - deliveryDueAt(b);
      if (byDue !== 0) return byDue;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return copy;
}

export function sellerStatusVariant(status?: string): 'green' | 'orange' | 'red' | 'gray' {
  if (status === 'approved') return 'green';
  if (status === 'rejected' || status === 'suspended') return 'red';
  if (status === 'pending') return 'orange';
  return 'gray';
}

export function useSellerShop() {
  return useQuery({ queryKey: ['seller-shop'], queryFn: () => sellerApi.shop() });
}
