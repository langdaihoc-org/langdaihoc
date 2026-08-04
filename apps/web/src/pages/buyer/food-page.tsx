import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { catalogApi, cartApi, ApiError, type FoodItem } from '@/lib/api';
import { EmptyState } from '@/components/ui/card';
import { StoreWithMenu } from '@/components/marketplace/store-with-menu';
import { CategoryChips } from '@/components/marketplace/category-chips';
import { FoodItemSheet, type FoodSheetAction } from '@/components/marketplace/food-item-sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/auth-context';
import { ListSkeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/ui/query-state';
import { useToast } from '@/components/ui/toast';

type PendingAdd = { quantity: number; options: string[]; note: string; action: FoodSheetAction };

export function FoodPage() {
  const [params] = useSearchParams();
  const qParam = params.get('q') ?? '';
  const category = params.get('category');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
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
    p.set('limit', '100');
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
      if (e instanceof ApiError && e.code === 'CART_SELLER_CONFLICT') {
        setConflictOpen(true);
        return;
      }
      toast(e instanceof ApiError ? e.message : 'Không thêm được vào giỏ', 'error');
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

