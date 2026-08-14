import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { catalogApi } from '@/lib/api';
import { EmptyState, Card } from '@/components/ui/card';
import { LaundryShopWithServices } from '@/components/marketplace/laundry-shop-with-services';
import { ListSkeleton } from '@/components/ui/skeleton';
import { LaundryProcessTimeline } from '@/components/ui/order-timeline';
import { QueryErrorState } from '@/components/ui/query-state';

export function LaundryPage() {
  const { data: sellers, isLoading: loadingSellers, isError: errSellers, refetch: refetchSellers } = useQuery({
    queryKey: ['sellers', 'laundry'],
    queryFn: () => catalogApi.sellers('laundry'),
  });
  const { data, isLoading: loadingServices, isError: errServices, refetch: refetchServices } = useQuery({
    queryKey: ['laundry'],
    queryFn: () => catalogApi.laundry(),
  });
  const services = data?.data ?? [];
  const isLoading = loadingSellers || loadingServices;

  const shopBlocks = useMemo(() => {
    const bySeller = new Map<string, typeof services>();
    for (const svc of services) {
      const list = bySeller.get(svc.sellerId) ?? [];
      list.push(svc);
      bySeller.set(svc.sellerId, list);
    }

    const list = [...(sellers?.data ?? [])].sort((a, b) => {
      const ac = bySeller.get(a.id)?.length ?? 0;
      const bc = bySeller.get(b.id)?.length ?? 0;
      return bc - ac;
    });

    return list.map((store) => ({
      store,
      services: bySeller.get(store.id) ?? [],
    }));
  }, [sellers, services]);

  const totalServices = shopBlocks.reduce((sum, b) => sum + b.services.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="text-left">
        <h1 className="text-xl font-bold tracking-tight">Giặt đồ</h1>
        {!isLoading && !errSellers && !errServices && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {shopBlocks.length} tiệm · {totalServices} dịch vụ
          </p>
        )}
      </div>

      <div className="flex gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Giá trên danh mục chỉ mang tính tham khảo. Cửa hàng báo giá chính thức sau khi nhận đồ.</p>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : errSellers || errServices ? (
        <QueryErrorState
          message="Không tải được danh sách tiệm giặt"
          onRetry={() => { void refetchSellers(); void refetchServices(); }}
        />
      ) : shopBlocks.length === 0 ? (
        <EmptyState title="Chưa có tiệm giặt" description="Hiện chưa có cửa hàng nhận đơn" />
      ) : (
        <div className="space-y-4">
          {shopBlocks.map(({ store, services: shopServices }) => (
            <LaundryShopWithServices
              key={store.id}
              store={store}
              services={shopServices}
            />
          ))}
        </div>
      )}

      <Card><LaundryProcessTimeline /></Card>
    </div>
  );
}

