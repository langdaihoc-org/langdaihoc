import { AlertTriangle, Bell, CheckCircle2, ClipboardList, MessageCircle, Package } from 'lucide-react';
import type { Notification } from '@/lib/api';
import { localizeNotificationText } from '@/lib/format';
import { cn } from '@/lib/utils';

function isComplaintNotif(n: Notification) {
  return (
    n.type.startsWith('complaint_')
    || n.title.toLowerCase().includes('khiếu nại')
    || Boolean(n.data?.complaintId)
  );
}

function notifMeta(n: Notification) {
  if (n.type === 'site_feedback' || isComplaintNotif(n)) {
    return {
      Icon: MessageCircle,
      iconWrap: 'bg-amber-100 text-amber-800',
      row: 'border-amber-200/80 bg-amber-50/90 hover:bg-amber-100/80',
      unreadRow: 'border-amber-300 bg-amber-100',
      label: n.type === 'site_feedback' ? 'Góp ý' : 'Khiếu nại',
      labelCls: 'text-amber-800',
    };
  }
  if (n.type === 'late_delivery_warning') {
    return {
      Icon: AlertTriangle,
      iconWrap: 'bg-red-100 text-red-700',
      row: 'border-red-100 bg-red-50/70 hover:bg-red-50',
      unreadRow: 'border-red-200 bg-red-50',
      label: 'Cảnh báo',
      labelCls: 'text-red-700',
    };
  }
  if (n.type === 'new_order') {
    return {
      Icon: Package,
      iconWrap: 'bg-emerald-100 text-emerald-700',
      row: 'border-[var(--color-line)] bg-white hover:bg-sky-50/60',
      unreadRow: 'border-brand-orange/25 bg-sky-50/80',
      label: 'Đơn mới',
      labelCls: 'text-emerald-700',
    };
  }
  if (n.type === 'complaint_resolved' || n.type.includes('resolved')) {
    return {
      Icon: CheckCircle2,
      iconWrap: 'bg-emerald-100 text-emerald-700',
      row: 'border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50',
      unreadRow: 'border-emerald-200 bg-emerald-50',
      label: 'Đã xử lý',
      labelCls: 'text-emerald-700',
    };
  }
  return {
    Icon: ClipboardList,
    iconWrap: 'bg-sky-100 text-brand-orange',
    row: 'border-[var(--color-line)] bg-white hover:bg-sky-50/60',
    unreadRow: 'border-brand-orange/25 bg-sky-50/80',
    label: 'Đơn hàng',
    labelCls: 'text-brand-orange',
  };
}

export function NotificationBellButton({
  open,
  unread,
  onToggle,
}: {
  open: boolean;
  unread: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
  );
}

export function NotificationPanel({
  items,
  onClose,
  onSelect,
  onMarkAllRead,
  markingAll,
}: {
  items: Notification[];
  onClose: () => void;
  onSelect: (n: Notification) => void;
  onMarkAllRead?: () => void;
  markingAll?: boolean;
}) {
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={onClose} aria-label="Đóng thông báo" />
      <div
        role="dialog"
        aria-label="Thông báo"
        className="fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-h-[min(28rem,72vh)] w-auto max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:mx-0 sm:w-[22rem] sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <div>
            <p className="text-sm font-bold">Thông báo</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {unread > 0 ? `${unread} chưa đọc` : 'Đã xem hết'}
            </p>
          </div>
          {unread > 0 && onMarkAllRead && (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={markingAll}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-orange hover:bg-sky-50 disabled:opacity-50"
            >
              Đánh dấu đã đọc
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Bell className="mx-auto size-8 text-[var(--color-muted)]" />
              <p className="mt-2 text-sm text-[var(--color-muted)]">Chưa có thông báo</p>
            </div>
          ) : (
            items.slice(0, 30).map((n) => {
              const meta = notifMeta(n);
              const unreadItem = !n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelect(n)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
                    unreadItem ? meta.unreadRow : meta.row,
                  )}
                >
                  <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', meta.iconWrap)}>
                    <meta.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide', meta.labelCls)}>
                        {meta.label}
                      </span>
                      {unreadItem && <span className="size-1.5 rounded-full bg-brand-orange" />}
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold leading-snug text-[var(--color-ink)]">
                      {localizeNotificationText(n.title)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--color-muted)]">
                      {localizeNotificationText(n.body)}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--color-muted)]">
                      {new Date(n.createdAt).toLocaleString('vi')}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
