import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { sellerApi, type Notification } from '@/lib/api';
import { localizeNotificationText } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SellerNotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => sellerApi.notifications(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-notifications'] }),
  });

  const readAllMut = useMutation({
    mutationFn: () => sellerApi.markAllNotificationsRead(),
    onMutate: () => markReadLocal(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-notifications'] }),
  });

  const items = data?.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const openPanel = () => {
    setOpen(true);
    if (unread > 0 && !readAllMut.isPending) readAllMut.mutate();
  };

  const goToNotification = (n: Notification) => {
    if (!n.readAt) readMut.mutate(n.id);
    setOpen(false);
    if (n.data?.complaintId) {
      navigate(`/seller/complaints?c=${n.data.complaintId}`);
      return;
    }
    if (n.type === 'late_delivery_warning' || n.type === 'new_order') {
      navigate('/seller/orders');
      return;
    }
    if (n.data?.orderId) {
      navigate('/seller/orders');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label="Thông báo"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex size-10 items-center justify-center rounded-full border border-[var(--color-line)] bg-white hover:border-brand-orange/40"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-label="Đóng thông báo" />
          <div
            role="dialog"
            aria-label="Thông báo"
            className="fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 mx-auto max-h-[min(24rem,70vh)] w-auto max-w-sm overflow-y-auto panel p-1.5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:mx-0 sm:w-80 sm:max-w-none"
          >
            <p className="px-3 py-2 text-sm font-semibold">Thông báo</p>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">Chưa có thông báo</p>
            ) : (
              items.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => goToNotification(n)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5',
                    !n.readAt && 'bg-sky-50/50',
                  )}
                >
                  <p className="font-medium">{localizeNotificationText(n.title)}</p>
                  <p className="text-xs text-[var(--color-muted)]">{localizeNotificationText(n.body)}</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
