import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatCard, DataTable } from '@/components/layout/dashboard-shell';
import { StatusBadge } from '@/components/ui/brand';
import { orderStatusLabel, formatPrice, orderDisplayTitle, sellerStatusLabel } from '@/lib/format';
import { QueryErrorState } from '@/components/ui/query-state';

export function AdminDashboard() {
  const { data: stats, isError: errStats, refetch: refetchStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats(),
  });
  const { data: sellers, isError: errSellers, refetch: refetchSellers } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => adminApi.sellers(),
  });
  const { data: orders, isError: errOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminApi.orders(),
  });
  const s = stats?.data;
  const pendingSellers = (sellers?.data ?? []).filter((r) => r.seller.status === 'pending');

  if (errStats || errSellers || errOrders) {
    return (
      <QueryErrorState
        message="Không tải được bảng điều khiển"
        onRetry={() => {
          void refetchStats();
          void refetchSellers();
          void refetchOrders();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard value={s?.buyers ?? 0} label="Tổng người dùng" />
        <StatCard value={s?.pendingSellers ?? 0} label="Đối tác chờ duyệt" accent="orange" />
        <StatCard value={s?.ordersToday ?? 0} label="Đơn hôm nay" />
        <StatCard value={s?.processingOrders ?? 0} label="Đơn đang xử lý" accent="orange" />
        <StatCard value={s?.openComplaints ?? 0} label="Khiếu nại mở" accent="orange" />
        <StatCard value={s?.sellers ?? 0} label="Tổng đối tác" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Đối tác chờ duyệt</h2>
          <DataTable
            headers={['Tên quán', 'Trạng thái', '']}
            rows={pendingSellers.slice(0, 5).map((row) => [
              row.seller.shopName,
              <StatusBadge key={row.seller.id}>{sellerStatusLabel(row.seller.status)}</StatusBadge>,
              <a key="l" href="/admin/sellers" className="text-xs font-bold text-brand-orange">Xem</a>,
            ])}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Đơn hàng gần đây</h2>
          <DataTable
            headers={['Mã', 'Tổng', 'Trạng thái']}
            rows={(orders?.data ?? []).slice(0, 6).map((o) => [orderDisplayTitle(o), formatPrice(o.total), <StatusBadge key={o.id}>{orderStatusLabel(o.status)}</StatusBadge>])}
          />
        </Card>
      </div>
    </div>
  );
}
