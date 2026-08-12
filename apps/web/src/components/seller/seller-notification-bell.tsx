import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sellerApi, ordersApi, type Notification } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { NotificationBellButton, NotificationPanel } from '@/components/ui/notification-panel';

export function SellerNotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const prevNotifAt = useRef<string | null>(null);

  // Badge + toast dựa pulse (đã O(1)) — không poll list notifications khi panel đóng.
  const { data: pulseData } = useQuery({
    queryKey: ['seller-orders-pulse'],
    queryFn: () => ordersApi.pulse(),
    staleTime: 4_000,
    refetchInterval: (q) => {
      const unread = q.state.data?.data?.unreadNotifications ?? 0;
      return unread > 0 ? 5_000 : 15_000;
    },
    refetchOnWindowFocus: true,
  });

  const { data } = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => sellerApi.notifications(),
    enabled: open,
    staleTime: 8_000,
    refetchOnWindowFocus: open,
    // Chỉ poll list khi panel đang mở và còn unread
    refetchInterval: open && (pulseData?.data?.unreadNotifications ?? 0) > 0 ? 15_000 : false,
  });

  useEffect(() => {
    const latest = pulseData?.data?.latestNotificationAt ?? null;
    const unread = pulseData?.data?.unreadNotifications ?? 0;
    if (latest) {
      if (prevNotifAt.current && prevNotifAt.current !== latest && unread > 0) {
        toast('Bạn có thông báo mới', 'success');
        if (open) {
          void qc.invalidateQueries({ queryKey: ['seller-notifications'] });
        }
      }
      prevNotifAt.current = latest;
    }
  }, [pulseData?.data?.latestNotificationAt, pulseData?.data?.unreadNotifications, open, qc, toast]);

  const markReadLocal = (ids?: string[]) => {
    qc.setQueryData<{ data: Notification[] }>(['seller-notifications'], (prev) => {
      if (!prev?.data) return prev;
      const now = new Date().toISOString();
      return {
        ...prev,
        data: prev.data.map((n) =>
          (!ids || ids.includes(n.id)) && !n.readAt ? { ...n, readAt: now } : n,
        ),
      };
    });
  };

  const readMut = useMutation({
    mutationFn: (id: string) => sellerApi.markNotificationRead(id),
    onMutate: (id) => markReadLocal([id]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['seller-notifications'] });
      void qc.invalidateQueries({ queryKey: ['seller-orders-pulse'] });
    },
  });

  const readAllMut = useMutation({
    mutationFn: () => sellerApi.markAllNotificationsRead(),
    onMutate: () => markReadLocal(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['seller-notifications'] });
      void qc.invalidateQueries({ queryKey: ['seller-orders-pulse'] });
    },
  });

  const items = data?.data ?? [];
  // Badge ưu tiên pulse — list chỉ load khi mở panel
  const unread = pulseData?.data?.unreadNotifications ?? items.filter((n) => !n.readAt).length;

  const goToNotification = (n: Notification) => {
    if (!n.readAt) readMut.mutate(n.id);
    setOpen(false);
    if (n.data?.complaintId) {
      navigate(`/seller/complaints?c=${n.data.complaintId}`);
      return;
    }
    if (n.type.startsWith('complaint_')) {
      navigate('/seller/complaints');
      return;
    }
    if (n.type === 'late_delivery_warning' || n.type === 'new_order' || n.data?.orderId) {
      navigate('/seller/orders');
    }
  };

  return (
    <div className="relative">
      <NotificationBellButton open={open} unread={unread} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <NotificationPanel
          items={items}
          onClose={() => setOpen(false)}
          onSelect={goToNotification}
          onMarkAllRead={() => readAllMut.mutate()}
          markingAll={readAllMut.isPending}
        />
      )}
    </div>
  );
}
