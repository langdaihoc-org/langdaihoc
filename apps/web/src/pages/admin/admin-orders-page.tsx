import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { DataTable } from '@/components/layout/dashboard-shell';
import { StatusBadge } from '@/components/ui/brand';
import { orderStatusLabel, formatPrice, orderDisplayTitle } from '@/lib/format';

export function AdminOrdersPage() {
  const { data } = useQuery({ queryKey: ['admin-orders'], queryFn: () => adminApi.orders() });
  return (
    <div className="space-y-3">
      <h1 className="font-bold">Tất cả đơn hàng</h1>
      <DataTable headers={['Đơn hàng', 'Tổng', 'Trạng thái']} rows={(data?.data ?? []).map((o) => [orderDisplayTitle(o), formatPrice(o.total), <StatusBadge key={o.id}>{orderStatusLabel(o.status)}</StatusBadge>])} />
    </div>
  );
}
