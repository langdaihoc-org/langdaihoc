import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useSellerShop } from './seller-shared';

export function SellerReviewsPage() {
  const { data: shopData } = useSellerShop();
  const sellerId = shopData?.data?.id;
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['seller-reviews', sellerId],
    queryFn: () => catalogApi.sellerReviews(sellerId!),
    enabled: !!sellerId,
  });
  const reviews = data?.data ?? [];
  const visible = filter === 'low' ? reviews.filter((r) => r.rating <= 2) : reviews;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-bold">Đánh giá từ khách hàng</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'all' ? 'green' : 'outline'} onClick={() => setFilter('all')}>Tất cả</Button>
          <Button size="sm" variant={filter === 'low' ? 'green' : 'outline'} onClick={() => setFilter('low')}>1–2 sao</Button>
        </div>
      </div>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : visible.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">
          {filter === 'low' ? 'Chưa có đánh giá 1–2 sao' : 'Chưa có đánh giá nào'}
        </Card>
      ) : visible.map((r) => (
        <Card key={r.id}>
          <p className="font-semibold">{r.buyerName}</p>
          <p className="text-yellow-400 text-xl">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
          {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
          <p className="mt-1 text-xs text-[var(--color-muted)]">{new Date(r.createdAt).toLocaleString('vi')}</p>
        </Card>
      ))}
    </div>
  );
}
