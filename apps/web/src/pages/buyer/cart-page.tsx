import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Minus, Trash2, WashingMachine, UtensilsCrossed, ShoppingBag } from 'lucide-react';
import { cartApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { FoodImage } from '@/components/marketplace/food-image';
import { QueryErrorState } from '@/components/ui/query-state';
import { useToast } from '@/components/ui/toast';

export function CartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['cart'], queryFn: () => cartApi.get() });
  const cart = data?.data;

  const updateMut = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => cartApi.update(id, quantity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được số lượng', 'error'),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => cartApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không xóa được món', 'error'),
  });

  if (isLoading) return <p className="py-12 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>;
  if (isError) return <QueryErrorState message="Không tải được giỏ hàng" onRetry={() => refetch()} className="mx-auto max-w-md" />;

  if (!cart?.items?.length) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-orange-50">
          <ShoppingBag className="size-8 text-brand-orange" />
        </div>
        <h2 className="text-lg font-bold">Giỏ hàng trống</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Thêm món hoặc đặt lịch giặt để tiếp tục.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/food"><Button><UtensilsCrossed className="size-4" /> Ăn uống</Button></Link>
          <Link to="/laundry"><Button variant="outline"><WashingMachine className="size-4" /> Giặt đồ</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Giỏ hàng</h1>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <UtensilsCrossed className="size-4 text-brand-orange" />
          <span className="text-sm font-semibold">{cart.shopName}</span>
        </div>
        {cart.items.map((item, i) => (
          <div key={item.id} className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-orange-50">
              <FoodImage index={i} alt={item.name} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{item.name}</p>
                <button type="button" aria-label="Xóa món" className="text-[var(--color-muted)] hover:text-red-500" onClick={() => removeMut.mutate(item.id)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              {!!item.optionsJson?.length && (
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {item.optionsJson.map((o) => o.name).join(', ')}
                </p>
              )}
              {item.note && <p className="mt-0.5 text-xs italic text-[var(--color-muted)]">Ghi chú: {item.note}</p>}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-full border border-[var(--color-line)] p-0.5">
                  <button type="button" aria-label="Giảm" className="flex size-11 items-center justify-center rounded-full hover:bg-black/5" onClick={() => updateMut.mutate({ id: item.id, quantity: Math.max(1, item.quantity - 1) })}><Minus className="size-3.5" /></button>
                  <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                  <button type="button" aria-label="Tăng" className="flex size-11 items-center justify-center rounded-full hover:bg-black/5" onClick={() => updateMut.mutate({ id: item.id, quantity: item.quantity + 1 })}><Plus className="size-3.5" /></button>
                </div>
                <span className="font-semibold">{formatPrice(item.lineTotal)}</span>
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="flex justify-between"><span className="font-semibold">Tổng cộng</span><span className="text-lg font-bold text-brand-orange">{formatPrice(cart.subtotal)}</span></div>
        <Button className="mt-4 w-full" size="lg" onClick={() => navigate('/checkout')}>Tiến hành đặt hàng</Button>
      </Card>
    </div>
  );
}

