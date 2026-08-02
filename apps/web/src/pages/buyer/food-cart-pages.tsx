import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus, Minus, Trash2, WashingMachine, UtensilsCrossed, ShoppingBag, Info } from 'lucide-react';
import { catalogApi, cartApi, ApiError, type FoodItem } from '@/lib/api';
import { EmptyState, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StoreWithMenu } from '@/components/marketplace/store-with-menu';
import { LaundryShopWithServices } from '@/components/marketplace/laundry-shop-with-services';
import { CategoryChips } from '@/components/marketplace/category-chips';
import { FoodItemSheet, type FoodSheetAction } from '@/components/marketplace/food-item-sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatPrice } from '@/lib/format';
import { useAuth } from '@/contexts/auth-context';
import { FoodImage } from '@/components/marketplace/food-image';
import { ListSkeleton } from '@/components/ui/skeleton';
import { LaundryProcessTimeline } from '@/components/ui/order-timeline';
import { QueryErrorState } from '@/components/ui/query-state';

type PendingAdd = { quantity: number; options: string[]; note: string; action: FoodSheetAction };

export function FoodPage() {
  const [params] = useSearchParams();
  const qParam = params.get('q') ?? '';
  const category = params.get('category');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (qParam) p.set('q', qParam);
    p.set('page', '1');
    p.set('limit', '200');
    return p.toString();
  }, [category, qParam]);

  const { data: sellers, isLoading: loadingSellers, isError: errSellers, refetch: refetchSellers } = useQuery({
    queryKey: ['sellers', 'food'],
    queryFn: () => catalogApi.sellers('food'),
  });
  const { data: foodData, isLoading: loadingFood, isError: errFood, refetch: refetchFood } = useQuery({
    queryKey: ['food', 'by-store', category, qParam],
    queryFn: () => catalogApi.food(queryString),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories', 'food'],
    queryFn: () => catalogApi.categories('food'),
  });

  const dishes = foodData?.data ?? [];
  const isLoading = loadingSellers || loadingFood;

  const storeBlocks = useMemo(() => {
    const dishesBySeller = new Map<string, FoodItem[]>();
    for (const dish of dishes) {
      const list = dishesBySeller.get(dish.sellerId) ?? [];
      list.push(dish);
      dishesBySeller.set(dish.sellerId, list);
    }

    let list = sellers?.data ?? [];
    if (qParam) {
      const q = qParam.toLowerCase();
      list = list.filter((s) => {
        if (s.shopName.toLowerCase().includes(q)) return true;
        return (dishesBySeller.get(s.id) ?? []).some((d) => d.name.toLowerCase().includes(q));
      });
    }
    if (category) {
      list = list.filter((s) => (dishesBySeller.get(s.id) ?? []).length > 0);
    } else {
      // Prefer shops that have menu; still show empty shops at the end
      list = [...list].sort((a, b) => {
        const ac = dishesBySeller.get(a.id)?.length ?? 0;
        const bc = dishesBySeller.get(b.id)?.length ?? 0;
        return bc - ac;
      });
    }

    return list.map((store) => ({
      store,
      items: dishesBySeller.get(store.id) ?? [],
    }));
  }, [sellers, dishes, qParam, category]);

  const totalDishes = storeBlocks.reduce((sum, b) => sum + b.items.length, 0);

  const addMut = useMutation({
    mutationFn: (p: {
      foodItemId: string;
      quantity: number;
      note?: string;
      options?: { id: string; name: string; priceDelta: number }[];
      forceClear?: boolean;
      action: FoodSheetAction;
    }) => {
      const { action, ...body } = p;
      return cartApi.add(body).then((res) => ({ res, action }));
    },
    onSuccess: ({ action }) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      setSelectedItem(null);
      setConflictOpen(false);
      setPendingAdd(null);
      if (action === 'buy') navigate('/checkout');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CART_SELLER_CONFLICT') setConflictOpen(true);
    },
  });

  const openSheet = (item: FoodItem, idx: number) => {
    if (!isAuthenticated) {
      navigate('/auth/login');
      return;
    }
    setSelectedItem(item);
    setSelectedIndex(idx);
  };

  const handleAdd = (
    p: { quantity: number; options: string[]; note: string },
    action: FoodSheetAction,
    force = false,
  ) => {
    if (!selectedItem) return;
    if (!force) setPendingAdd({ ...p, action });
    const catalogOptions = (selectedItem.optionGroups ?? []).flatMap((g) => g.options ?? []);
    const fallback = selectedItem.options ?? [];
    const allOptions = catalogOptions.length ? catalogOptions : fallback;
    const seen = new Set<string>();
    const opts = allOptions
      .filter((o) => p.options.includes(o.id) && !seen.has(o.id) && (seen.add(o.id), true))
      .map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta }));
    addMut.mutate({
      foodItemId: selectedItem.id,
      quantity: p.quantity,
      note: p.note || undefined,
      options: opts,
      forceClear: force,
      action,
    });
  };

  return (
    <div className="space-y-5">
      <div className="text-left">
        <h1 className="text-xl font-bold tracking-tight">
          {qParam ? `Kết quả “${qParam}”` : 'Ăn uống'}
        </h1>
        {!isLoading && !errSellers && !errFood && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {storeBlocks.length} quán · {totalDishes} món
          </p>
        )}
      </div>

      <CategoryChips
        categories={categories?.data ?? []}
        active={category}
        onChange={(slug) => navigate(slug ? `/food?category=${slug}` : '/food')}
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : errSellers || errFood ? (
        <QueryErrorState
          message="Không tải được danh sách quán"
          onRetry={() => { void refetchSellers(); void refetchFood(); }}
        />
      ) : storeBlocks.length === 0 ? (
        <EmptyState title="Không tìm thấy quán" description="Thử từ khóa hoặc danh mục khác" />
      ) : (
        <div className="space-y-4">
          {storeBlocks.map(({ store, items }, i) => (
            <StoreWithMenu
              key={store.id}
              store={store}
              items={items}
              index={i}
              onAddItem={openSheet}
            />
          ))}
        </div>
      )}

      <FoodItemSheet
        item={selectedItem}
        imageIndex={selectedIndex}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onAdd={(p, action) => handleAdd(p, action)}
        loading={addMut.isPending}
      />
      <ConfirmDialog
        open={conflictOpen}
        title="Đổi quán?"
        description={
          pendingAdd?.action === 'buy'
            ? 'Giỏ đang có món quán khác. Xóa giỏ cũ và mua món này ngay?'
            : 'Giỏ đang có món quán khác. Xóa giỏ cũ và thêm món này?'
        }
        confirmLabel={pendingAdd?.action === 'buy' ? 'Mua ngay' : 'Thêm vào giỏ'}
        cancelLabel="Giữ giỏ cũ"
        variant="warning"
        loading={addMut.isPending}
        onConfirm={() => pendingAdd && handleAdd(pendingAdd, pendingAdd.action, true)}
        onCancel={() => {
          setConflictOpen(false);
          setPendingAdd(null);
        }}
      />
    </div>
  );
}

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
        <p>Giá tạm tính theo cân nặng ước lượng. Cửa hàng cân lại khi nhận đồ và báo giá trước khi giặt.</p>
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

export function CartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['cart'], queryFn: () => cartApi.get() });
  const cart = data?.data;

  const updateMut = useMutation({ mutationFn: ({ id, quantity }: { id: string; quantity: number }) => cartApi.update(id, quantity), onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }) });
  const removeMut = useMutation({ mutationFn: (id: string) => cartApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }) });

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
