import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Clock, WashingMachine, UtensilsCrossed, Package, PackageOpen } from 'lucide-react';
import { ordersApi, type Order } from '@/lib/api';
import { formatPrice, orderStatusLabel, orderDisplayTitle } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { cn } from '@/lib/utils';
import { QueryErrorState } from '@/components/ui/query-state';

const HIDDEN_ORDER = new Set(['cancelled', 'rejected', 'needs_support']);

const PAGE_SIZE = 20;

export function OrdersPage() {
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [page, setPage] = useState(1);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ active: 0, done: 0 });

  const { data: pageData, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['orders', tab, page],
    queryFn: () => ordersApi.list(page, PAGE_SIZE, { scope: tab }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!pageData) return;
    setAllOrders((prev) => {
      const existing = new Set(prev.map((o) => o.id));
      const fresh = pageData.data.filter((o) => !existing.has(o.id));
      return page === 1 ? pageData.data : [...prev, ...fresh];
    });
    setHasMore(pageData.meta?.hasMore ?? false);
    if (pageData.meta?.counts) {
      setCounts({
        active: pageData.meta.counts.active ?? 0,
        done: pageData.meta.counts.done ?? 0,
      });
    }
  }, [pageData, page]);

  const handleTabChange = (next: 'active' | 'done') => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setAllOrders([]);
    setHasMore(false);
  };

  const orders = useMemo(
    () => allOrders.filter((o) => !HIDDEN_ORDER.has(o.status)),
    [allOrders],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-end justify-between gap-2">
        <h1 className="text-xl font-bold">Đơn hàng của tôi</h1>
        <p className="text-[11px] text-[var(--color-muted)]">
          {isFetching
            ? 'Đang cập nhật…'
            : dataUpdatedAt
              ? `Theo dõi nhẹ · ${new Date(dataUpdatedAt).toLocaleTimeString('vi')}`
              : 'Theo dõi nhẹ'}
        </p>
      </div>
      <div className="panel overflow-hidden p-0">
        <div className="flex border-b border-[var(--color-line)]">
          {([
            ['active', 'Đang xử lý', counts.active],
            ['done', 'Hoàn tất', counts.done],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleTabChange(id)}
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors',
                tab === id ? 'border-b-2 border-brand-orange text-brand-orange' : 'text-[var(--color-muted)]',
              )}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        {isLoading ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>
        ) : isError ? (
          <QueryErrorState message="Không tải được danh sách đơn" onRetry={() => refetch()} className="border-0 shadow-none" />
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <PackageOpen className="mx-auto size-10 text-[var(--color-muted)]" />
            <p className="mt-2 text-sm text-[var(--color-muted)]">Chưa có đơn trong mục này</p>
          </div>
        ) : (
          <>
            {orders.map((o) => {
              const hasOpenComplaint = !!o.complaint && !['resolved', 'rejected'].includes(o.complaint.status);
              return (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className={cn(
                  'flex gap-3 border-b border-[var(--color-line)] px-4 py-3 transition-colors last:border-0',
                  hasOpenComplaint
                    ? 'border-l-4 border-l-amber-400 bg-amber-50 hover:bg-amber-100/70'
                    : 'hover:bg-black/[0.02]',
                )}
              >
                <div className={cn(
                  'grid size-12 place-items-center rounded-xl text-[var(--color-ink)]',
                  hasOpenComplaint ? 'bg-amber-200/70' : 'bg-orange-50',
                )}>
                  {o.type === 'food' ? (
                    <UtensilsCrossed className="size-5" />
                  ) : o.type === 'ship_proxy' ? (
                    <Package className="size-5" />
                  ) : (
                    <WashingMachine className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-semibold">{orderDisplayTitle(o)}</span>
                    <StatusBadge variant={o.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(o.status, o.type)}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{o.orderCode}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-muted)]">
                    <Clock className="size-3" />{new Date(o.createdAt).toLocaleString('vi')}
                  </p>
                  {hasOpenComplaint && (
                    <p className="mt-1 rounded-lg border border-amber-300 bg-amber-200/60 px-2 py-1 text-[11px] font-semibold text-amber-950">
                      Khiếu nại · {o.complaint!.reason}
                    </p>
                  )}
                  {o.type === 'food' && o.items && o.items.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">
                      {o.items.map((it) => `${it.itemName}×${it.quantity}`).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 font-bold text-brand-orange">{formatPrice(o.total)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-brand-orange-dark">Xem chi tiết →</p>
                </div>
              </Link>
              );
            })}
            {hasMore && (
              <div className="border-t border-[var(--color-line)] px-4 py-3 text-center">
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-sm font-semibold text-brand-orange disabled:opacity-50"
                >
                  {isFetching ? 'Đang tải…' : 'Xem thêm'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
