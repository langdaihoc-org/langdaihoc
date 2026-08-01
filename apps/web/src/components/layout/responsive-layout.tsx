import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, ShoppingBag, Home, UtensilsCrossed,
  WashingMachine, ClipboardList, User, LogOut, Bell, Compass, Bike,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BrandLogo } from '@/components/ui/brand';
import { cartApi, buyerApi, type Notification } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { StickyCartBar } from '@/components/marketplace/sticky-cart-bar';
import { BuyerFooter } from '@/components/layout/buyer-footer';
import { EmailVerifyBanner } from '@/components/layout/email-verify-banner';
import { localizeNotificationText } from '@/lib/format';
import { useBuyerLive } from '@/hooks/use-buyer-live';
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications';

const NAV = [
  { to: '/', label: 'Trang chủ' },
  { to: '/explore', label: 'Khám phá' },
  { to: '/food', label: 'Ăn uống' },
  { to: '/laundry', label: 'Giặt đồ' },
  { to: '/ship', label: 'Nhận đồ ship hộ' },
  { to: '/orders', label: 'Đơn hàng' },
];

function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => buyerApi.notifications(),
    enabled: isAuthenticated,
    // Pulse buyer lo cập nhật; chỉ refetch khi focus / invalidate
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const markReadLocal = (ids?: string[]) => {
    qc.setQueryData<{ data: Notification[] }>(['notifications'], (prev) => {
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
    mutationFn: (id: string) => buyerApi.markNotificationRead(id),
    onMutate: (id) => markReadLocal([id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readAllMut = useMutation({
    mutationFn: () => buyerApi.markAllNotificationsRead(),
    onMutate: () => markReadLocal(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (!isAuthenticated) return null;

  const items = data?.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const openPanel = () => {
    setOpen(true);
    if (unread > 0 && !readAllMut.isPending) readAllMut.mutate();
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
          <div className="absolute right-0 top-11 z-50 w-80 panel max-h-96 overflow-y-auto p-1.5">
            <p className="px-3 py-2 text-sm font-semibold">Thông báo</p>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">Chưa có thông báo</p>
            ) : items.slice(0, 20).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.readAt) readMut.mutate(n.id);
                  setOpen(false);
                  if (n.data?.orderId) navigate(`/orders/${n.data.orderId}`);
                }}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5',
                  !n.readAt && 'bg-sky-50/50',
                )}
              >
                <p className="font-medium">{localizeNotificationText(n.title)}</p>
                <p className="text-xs text-[var(--color-muted)]">{localizeNotificationText(n.body)}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Link to="/auth/login" className="flex h-10 items-center rounded-full bg-brand-orange-dark px-4 text-sm font-semibold text-white hover:bg-[#072a4d]">
        Đăng nhập
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tài khoản"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-10 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--color-ink)] hover:border-brand-orange/40"
      >
        <User className="size-4.5" />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-label="Đóng menu" />
          <div className="absolute right-0 top-11 z-50 w-60 panel p-1.5">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{user?.fullName}</p>
              <p className="text-xs text-[var(--color-muted)]">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-[var(--color-line)]" />
            <Link to="/orders" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-black/5">
              <ClipboardList className="size-4 text-[var(--color-muted)]" /> Đơn hàng của tôi
            </Link>
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-black/5">
              <User className="size-4 text-[var(--color-muted)]" /> Hồ sơ
            </Link>
            <div className="my-1 h-px bg-[var(--color-line)]" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout().then(() => navigate('/auth/login', { replace: true }));
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        navigate(q ? `/food?q=${encodeURIComponent(q)}` : '/food');
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <input
          name="q"
          aria-label="Tìm món ăn, quán"
          placeholder="Tìm món ăn, quán..."
          className="h-11 w-full rounded-full border border-[var(--color-line)] bg-white pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-orange/50 focus-visible:ring-2 focus-visible:ring-brand-orange/40"
        />
      </div>
    </form>
  );
}

export function Topbar() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({ queryKey: ['cart'], queryFn: () => cartApi.get(), enabled: isAuthenticated });
  const count = data?.data?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)]/70 bg-[var(--color-surface)]/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <BrandLogo />

        <nav className="ml-1 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
                  ? 'bg-black/5 text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Search chỉ hiện ≥md; ml-auto phải nằm trên cụm action để mobile vẫn lệch phải */}
        <SearchBox className="hidden max-w-xs flex-1 md:block md:ml-4" />

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationBell />
          <Link
            to="/cart"
            aria-label="Giỏ hàng"
            className="relative flex size-10 items-center justify-center rounded-full border border-[var(--color-line)] bg-white hover:border-brand-orange/40"
          >
            <ShoppingBag className="size-4.5" />
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-brand-orange-dark text-[11px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <UserMenu />
        </div>
      </div>

      <div className="border-t border-[var(--color-line)]/70 px-4 py-2.5 md:hidden">
        <SearchBox />
      </div>
    </header>
  );
}

/** Container is provided by the layout; kept as passthrough for page compatibility. */
export function BuyerPageShell({ children }: { children: React.ReactNode; tabs?: boolean }) {
  return <>{children}</>;
}

const MOB_NAV = [
  { to: '/', label: 'Trang chủ', icon: Home },
  { to: '/explore', label: 'Khám phá', icon: Compass },
  { to: '/food', label: 'Ăn uống', icon: UtensilsCrossed },
  { to: '/laundry', label: 'Giặt', icon: WashingMachine },
  { to: '/ship', label: 'Ship hộ', icon: Bike },
  { to: '/orders', label: 'Đơn', icon: ClipboardList },
];

export function ResponsiveBuyerLayout() {
  useBuyerLive();
  useRealtimeNotifications();
  const { pathname } = useLocation();
  const showCart = !pathname.startsWith('/cart') && !pathname.startsWith('/checkout');

  return (
    <div className="min-h-screen pb-20 lg:pb-8">
      <Topbar />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <EmailVerifyBanner />
        <Outlet />
      </main>
      <BuyerFooter />
      {showCart && <StickyCartBar bottomOffset="bottom-[72px] lg:bottom-4" />}
      {/* Bottom nav sống tới lg — tablet (md–lg) vẫn có điều hướng vì top nav chỉ hiện từ lg */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-white/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {MOB_NAV.map((item) => {
            const active =
              item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight transition-colors sm:text-xs min-h-[52px] justify-center',
                  active ? 'text-brand-orange' : 'text-[var(--color-muted)]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
