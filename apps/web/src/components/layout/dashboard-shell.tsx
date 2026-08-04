import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MoreHorizontal, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/ui/brand';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';

export type DashboardLink = { to: string; label: string; Icon: LucideIcon; badge?: number; emphasize?: boolean };

export type MobileNavItem = { to: string; label: string; Icon: LucideIcon; badge?: number; emphasize?: boolean };

export function DashboardShell({
  title,
  subtitle,
  links,
  homeTo,
  accent = 'green',
  mobilePrimary,
  mobileMore,
  children,
}: {
  title: string;
  subtitle: string;
  links: DashboardLink[];
  homeTo: string;
  accent?: 'green' | 'orange';
  mobilePrimary?: MobileNavItem[];
  mobileMore?: DashboardLink[];
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeCls =
    accent === 'green'
      ? 'bg-grad-seller text-white shadow-[0_8px_20px_rgba(14,116,144,0.25)]'
      : 'bg-grad-admin text-white shadow-[0_8px_20px_rgba(46,183,229,0.28)]';

  const mobileAccent = accent === 'green' ? 'text-brand-green' : 'text-brand-orange';
  const morePaths = new Set((mobileMore ?? []).map((l) => l.to));
  const productPaths = new Set(['/seller/products', '/seller/menu', '/seller/laundry']);
  const isMoreActive = morePaths.has(pathname);
  const isNavActive = (to: string) => {
    if (to === homeTo) return pathname === to;
    if (to === '/seller/products') return productPaths.has(pathname);
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <div className={cn('min-h-screen bg-[var(--color-surface)]', mobilePrimary && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0')}>
      <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo to={homeTo} />
            {mobilePrimary && (
              <div className="min-w-0 lg:hidden">
                <p className={cn('truncate text-sm font-bold', mobileAccent)}>{subtitle}</p>
                <p className="truncate text-[10px] font-medium text-[var(--color-muted)]">{title}</p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user && (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-line)] bg-sky-50 text-xs font-semibold text-brand-orange">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    (user.fullName?.trim()?.charAt(0) || '?').toUpperCase()
                  )}
                </div>
                <span className="max-w-[120px] truncate text-sm text-[var(--color-muted)] lg:max-w-none">
                  {user.fullName}
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={async () => {
                await logout();
                navigate('/auth/login', { replace: true });
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden md:inline">Đăng xuất</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6 lg:py-5">
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="panel hidden p-4 lg:block lg:sticky lg:top-[72px] h-fit">
            <h2 className={cn('text-xl font-semibold leading-tight', mobileAccent)}>{title}</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">{subtitle}</p>
            <nav className="mt-4 flex flex-col gap-1">
              {links.map((l) => {
                const active = isNavActive(l.to);
                const hot = !active && !!l.emphasize && (l.badge ?? 0) > 0;
                return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    'relative flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition',
                    active ? activeCls : hot
                      ? 'bg-sky-50 text-brand-orange ring-1 ring-brand-orange/30'
                      : 'text-[#506358] hover:bg-sky-50',
                  )}
                >
                  <l.Icon className="size-4 shrink-0" />
                  <span className="flex-1">{l.label}</span>
                  {(l.badge ?? 0) > 0 && (
                    <span
                      className={cn(
                        'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold',
                        active ? 'bg-white/25 text-white' : 'bg-brand-orange text-white',
                      )}
                    >
                      {l.badge! > 99 ? '99+' : l.badge}
                    </span>
                  )}
                </Link>
                );
              })}
            </nav>
          </aside>
          <main className={cn('min-w-0', mobilePrimary && 'mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none')}>{children}</main>
        </div>
      </div>

      {mobilePrimary && (
        <>
          <nav className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--color-line)] bg-white/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex max-w-lg items-stretch">
              {mobilePrimary.map(({ to, label, Icon, badge, emphasize }) => {
                const active = isNavActive(to);
                const hot = !active && !!emphasize && (badge ?? 0) > 0;
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors touch-manipulation',
                      active ? mobileAccent : hot ? 'text-brand-orange' : 'text-[var(--color-muted)]',
                    )}
                  >
                    <span className="relative">
                      <Icon className={cn('size-5', (active || hot) && 'stroke-[2.5]')} />
                      {(badge ?? 0) > 0 && (
                        <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[9px] font-bold text-white">
                          {badge! > 99 ? '99+' : badge}
                        </span>
                      )}
                    </span>
                    {label}
                  </Link>
                );
              })}
              {mobileMore && mobileMore.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors touch-manipulation',
                    isMoreActive || moreOpen ? mobileAccent : 'text-[var(--color-muted)]',
                  )}
                >
                  <MoreHorizontal className="size-5" />
                  Thêm
                </button>
              )}
            </div>
          </nav>

          {moreOpen && mobileMore && (
            <div className="fixed inset-0 z-[60] lg:hidden">
              <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setMoreOpen(false)} aria-label="Đóng" />
              <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold">Thêm tính năng</h3>
                  <button type="button" onClick={() => setMoreOpen(false)} aria-label="Đóng" className="rounded-full p-2 hover:bg-black/5">
                    <X className="size-5" />
                  </button>
                </div>
                <div className="space-y-1">
                  {mobileMore.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition',
                        pathname === l.to ? 'bg-green-50 text-brand-green' : 'hover:bg-black/[0.03]',
                      )}
                    >
                      <l.Icon className="size-5 shrink-0" />
                      {l.label}
                    </Link>
                  ))}
                </div>
                <div className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-4">
                  <Button
                    variant="outline"
                    className="w-full sm:hidden"
                    onClick={async () => {
                      setMoreOpen(false);
                      await logout();
                      navigate('/auth/login', { replace: true });
                    }}
                  >
                    <LogOut className="size-4" />
                    Đăng xuất
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function StatCard({
  value,
  label,
  trend,
  accent,
}: {
  value: string | number;
  label: string;
  trend?: string;
  accent?: 'orange' | 'green';
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-bold text-[var(--color-muted)]">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', accent === 'orange' ? 'text-brand-orange' : 'text-brand-green')}>
        {value}
      </p>
      {trend && <p className="mt-0.5 text-[10px] font-semibold text-brand-green">{trend}</p>}
    </div>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-line)] last:border-0 hover:bg-sky-50/30">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 font-semibold">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
