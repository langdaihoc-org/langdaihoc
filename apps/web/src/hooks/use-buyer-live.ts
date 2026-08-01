import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

/**
 * Pulse nhẹ cho buyer: aggregate đơn + unread thông báo.
 * Chỉ invalidate full list/detail khi fingerprint đổi — tránh nặng Supabase Pro.
 *
 * Interval (tab đang mở):
 * - cần buyer phản hồi (chốt giá…): 10s
 * - còn đơn mở: 15s
 * - yên: 30s
 * Tab ẩn: tắt poll.
 */
export function useBuyerLive() {
  const { isAuthenticated, user } = useAuth();
  const enabled = isAuthenticated && user?.role === 'buyer';
  const qc = useQueryClient();
  const prevOrdersSig = useRef<string | null>(null);
  const prevNotifSig = useRef<string | null>(null);

  const pulseQuery = useQuery({
    queryKey: ['buyer-orders-pulse'],
    queryFn: () => ordersApi.pulse(),
    enabled,
    refetchInterval: (q) => {
      const d = q.state.data?.data;
      if (!d) return 30_000;
      if ((d.pendingCount ?? 0) > 0) return 10_000;
      if ((d.openCount ?? 0) > 0) return 15_000;
      return 30_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 8_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const pulse = pulseQuery.data?.data;
    if (!pulse) return;

    const ordersSig = `${pulse.openCount}|${pulse.pendingCount}|${pulse.latestCreatedAt}|${pulse.latestUpdatedAt}`;
    const notifSig = `${pulse.unreadNotifications ?? 0}|${pulse.latestNotificationAt ?? ''}`;

    if (prevOrdersSig.current == null) {
      prevOrdersSig.current = ordersSig;
      prevNotifSig.current = notifSig;
      return;
    }

    if (prevOrdersSig.current !== ordersSig) {
      prevOrdersSig.current = ordersSig;
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order'] });
    }

    if (prevNotifSig.current !== notifSig) {
      prevNotifSig.current = notifSig;
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  }, [enabled, pulseQuery.data?.data, qc]);
}

export function invalidateBuyerLive(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['orders'] });
  void qc.invalidateQueries({ queryKey: ['order'] });
  void qc.invalidateQueries({ queryKey: ['buyer-orders-pulse'] });
  void qc.invalidateQueries({ queryKey: ['notifications'] });
}
