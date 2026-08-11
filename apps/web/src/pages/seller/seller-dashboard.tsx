import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ordersApi, sellerApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { orderStatusLabel, formatPrice, orderTypeLabel, orderDisplayTitle } from '@/lib/format';
import { StatCard, DataTable } from '@/components/layout/dashboard-shell';
import { StatusBadge } from '@/components/ui/brand';
import { useToast } from '@/components/ui/toast';
import { useSellerShop } from './seller-shared';

export function SellerDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: shopData } = useSellerShop();
  const shop = shopData?.data;
  const accepting = shop?.acceptingOrders !== false;
  const { data } = useQuery({
    queryKey: ['seller-orders', 'summary'],
    queryFn: () => ordersApi.list(1, 10, { view: 'summary' }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const orders = data?.data ?? [];
  const counts = data?.meta?.counts;
  const pending = counts?.pending ?? orders.filter((o) => o.status === 'pending').length;
  const preparing =
    counts?.preparing ??
    orders.filter((o) =>
      ['accepted', 'preparing', 'picking_up', 'picked_up', 'washing', 'waiting_price_confirmation'].includes(o.status),
    ).length;
  const delivering =
    counts?.delivering ?? orders.filter((o) => ['delivering', 'returning'].includes(o.status)).length;
  const monthlyRevenue =
    counts?.monthlyRevenue ??
    counts?.completedRevenue ??
    orders.filter((o) => o.status === 'completed').reduce((s, o) => s + Number(o.total), 0);
  const monthlyOrderCount = counts?.monthlyOrderCount ?? 0;
  const periodStartedAt = counts?.billingPeriodStartedAt ?? null;

  const toggleOpen = useMutation({
    mutationFn: (next: boolean) => sellerApi.updateShop({ acceptingOrders: next }),
    onSuccess: (res) => {
      qc.setQueryData(['seller-shop'], res);
      void qc.invalidateQueries({ queryKey: ['seller-shop'] });
      toast(
        res.data.acceptingOrders === false
          ? 'Đã tạm đóng quán — không nhận đơn mới'
          : 'Đã mở quán — khách có thể đặt lại',
        'success',
      );
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được', 'error'),
  });

  return (
    <div className="space-y-4">
      {shop?.status === 'approved' && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{accepting ? 'Đang nhận đơn' : 'Đã tạm đóng quán'}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {accepting
                ? 'Tắt khi hết đồ / nghỉ bán hôm nay. Đơn đang chạy vẫn xử lý được.'
                : 'Khách không thấy quán trên app cho đến khi bạn mở lại.'}
            </p>
          </div>
          <Button
            variant={accepting ? 'danger' : 'green'}
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            loading={toggleOpen.isPending}
            onClick={() => toggleOpen.mutate(!accepting)}
          >
            {accepting ? 'Đóng quán hôm nay' : 'Mở quán lại'}
          </Button>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard value={pending} label="Đơn mới" accent="orange" />
        <StatCard value={preparing} label="Đang xử lý" />
        <StatCard value={delivering} label="Đang giao" accent="orange" />
        <StatCard value={monthlyOrderCount} label="Tổng số đơn tháng" />
        <StatCard value={formatPrice(monthlyRevenue)} label="Tổng doanh thu tháng" accent="orange" />
      </div>
      {periodStartedAt ? (
        <p className="text-[11px] text-[var(--color-muted)]">
          Kỳ tính từ {new Date(periodStartedAt).toLocaleString('vi-VN')}
        </p>
      ) : null}
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold">Đơn gần đây</h2>
          <Link to="/seller/orders" className="text-xs font-bold text-brand-green lg:hidden">Xem tất cả</Link>
        </div>
        <div className="space-y-2 lg:hidden">
          {orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">Chưa có đơn hàng</p>
          ) : orders.slice(0, 6).map((o) => (
            <Link key={o.id} to="/seller/orders" className="block rounded-xl border border-[var(--color-line)] p-3 transition hover:bg-green-50/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{orderDisplayTitle(o)}</p>
                  <p className="text-xs text-[var(--color-muted)]">{orderTypeLabel(o.type)} · {formatPrice(o.total)}</p>
                </div>
                <StatusBadge>{orderStatusLabel(o.status, o.type)}</StatusBadge>
              </div>
            </Link>
          ))}
        </div>
        <div className="hidden lg:block">
          <DataTable
            headers={['Đơn hàng', 'Loại', 'Tổng', 'TT thanh toán', 'Trạng thái']}
            rows={orders.slice(0, 10).map((o) => [
              orderDisplayTitle(o),
              orderTypeLabel(o.type),
              formatPrice(o.total),
              o.paymentStatus,
              <StatusBadge key={o.id}>{orderStatusLabel(o.status, o.type)}</StatusBadge>,
            ])}
          />
        </div>
      </Card>
    </div>
  );
}
