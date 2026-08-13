import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Clock, Star } from 'lucide-react';
import { catalogApi, cartApi } from '@/lib/api';
import { FoodItemSheet, type FoodSheetAction } from '@/components/marketplace/food-item-sheet';
import { MenuItemRow, StoreInfoCard } from '@/components/marketplace/store-card';
import { ImageLightbox } from '@/components/marketplace/store-with-menu';
import { StoreAvatar } from '@/components/marketplace/food-image';
import { formatRating, deliveryEta } from '@/lib/format';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, type FoodItem } from '@/lib/api';
import { useIsMobile } from '@/hooks/use-media-query';
import { StatusBadge } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReviewTagList } from '@/components/marketplace/review-tags';
import { cn } from '@/lib/utils';

const CAT_ICONS: Record<string, string> = { com: '🍚', 'do-uong': '🥤' };

type PendingAdd = { quantity: number; options: string[]; note: string; action: FoodSheetAction };

export function StorePage() {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightbox, setLightbox] = useState<{ item: FoodItem; i: number } | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const selectedId = selectedItem?.id;
  const { data: foodDetail } = useQuery({
    queryKey: ['food-item', selectedId],
    queryFn: async () => (await catalogApi.foodItem(selectedId!)).data,
    enabled: Boolean(selectedId),
    staleTime: 30_000,
  });
  const sheetItem = foodDetail ?? selectedItem;

  const { data: store, isLoading: loadingStore } = useQuery({
    queryKey: ['seller', sellerId],
    queryFn: async () => (await catalogApi.seller(sellerId!)).data,
    enabled: !!sellerId,
  });
  const { data: menu, isLoading } = useQuery({
    queryKey: ['food', sellerId],
    queryFn: () => catalogApi.food(`sellerId=${sellerId}&limit=100`),
    enabled: !!sellerId,
  });
  const { data: categories } = useQuery({ queryKey: ['categories', 'food'], queryFn: () => catalogApi.categories('food') });
  const { data: reviewsData } = useQuery({
    queryKey: ['reviews', sellerId],
    queryFn: () => catalogApi.sellerReviews(sellerId!),
    enabled: !!sellerId,
  });

  const items = menu?.data ?? [];
  const filtered = activeCat ? items.filter((i) => i.categoryId === activeCat) : items;
  const detail = filtered[0] ?? items[0] ?? null;
  const avgMins = store?.avgDeliveryMinutes != null ? Number(store.avgDeliveryMinutes) : null;
  const areas = store?.serviceAreas?.filter(Boolean) ?? [];
  const deliveryLabel = avgMins != null ? `~${avgMins} phút` : '—';
  const pageLoading = loadingStore || isLoading;
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
    if (!isAuthenticated) { navigate('/auth/login'); return; }
    setSelectedItem(item); setSelectedIndex(idx);
  };

  const handleAdd = (
    p: { quantity: number; options: string[]; note: string },
    action: FoodSheetAction,
    force = false,
  ) => {
    if (!sheetItem) return;
    if (!force) setPendingAdd({ ...p, action });
    const catalogOptions = (sheetItem.optionGroups ?? []).flatMap((g) => g.options ?? []);
    const fallback = sheetItem.options ?? [];
    const allOptions = catalogOptions.length ? catalogOptions : fallback;
    const seen = new Set<string>();
    const opts = allOptions
      .filter((o) => p.options.includes(o.id) && !seen.has(o.id) && (seen.add(o.id), true))
      .map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta }));
    addMut.mutate({
      foodItemId: sheetItem.id,
      quantity: p.quantity,
      note: p.note || undefined,
      options: opts,
      forceClear: force,
      action,
    });
  };

  const rating = store ? formatRating(store.rating?.average, store.rating?.count) : null;

  const categorySidebar = (
    <div className="space-y-1">
      <button type="button" onClick={() => setActiveCat(null)} className={cn('w-full text-left rounded-xl px-3 py-2 text-sm font-medium', !activeCat ? 'bg-orange-50 text-brand-orange' : 'text-[var(--color-muted)] hover:bg-black/5')}>Tất cả</button>
      {(categories?.data ?? []).map((c) => (
        <button key={c.id} type="button" onClick={() => setActiveCat(c.id)} className={cn('w-full text-left rounded-xl px-3 py-2 text-sm font-medium', activeCat === c.id ? 'bg-orange-50 text-brand-orange' : 'text-[var(--color-muted)] hover:bg-black/5')}>
          {CAT_ICONS[c.slug] ?? '🍽️'} {c.name}
        </button>
      ))}
    </div>
  );

  const menuList = (
    <div className="panel p-0 overflow-hidden max-h-[620px] overflow-y-auto">
      <p className="px-4 py-3 text-sm font-semibold border-b border-[var(--color-line)]">Thực đơn</p>
      {filtered.map((item, i) => (
        <div key={item.id} className={cn(detail?.id === item.id && 'bg-orange-50/60')}>
          <MenuItemRow
            name={item.name}
            description={item.description}
            price={item.price}
            imageIndex={i}
            imageUrl={item.imageUrl}
            onAdd={() => openSheet(item, i)}
            onImageClick={() => setLightbox({ item, i })}
            badge={undefined}
          />
        </div>
      ))}
    </div>
  );

  const detailPanel = detail && (
    <div className="panel overflow-hidden">
      <button
        type="button"
        className="relative block h-52 w-full bg-orange-50"
        onClick={() => setLightbox({ item: detail, i: items.indexOf(detail) })}
        aria-label={`Xem ảnh ${detail.name}`}
      >
        <img src={detail.imageUrl || '/assets/food-teriyaki.svg'} alt={detail.name} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3"><StatusBadge>🔥 Bán chạy</StatusBadge></span>
      </button>
      <div className="p-4">
        <h2 className="text-xl font-bold">{detail.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-[var(--color-muted)]">
          <Star className="size-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
          <span className="font-medium text-[var(--color-ink)]">{rating?.text}</span>
          <span>· {deliveryEta(detail.prepTimeMinutes)}</span>
          {avgMins != null && <span>· {deliveryLabel}</span>}
        </p>
        {detail.description && <p className="mt-2 text-sm text-[var(--color-muted)]">{detail.description}</p>}
        <p className="mt-3 text-2xl font-bold text-brand-orange">{detail.price.toLocaleString('vi-VN')}₫</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { v: `${detail.prepTimeMinutes}p`, l: 'Chuẩn bị' },
            { v: deliveryEta(detail.prepTimeMinutes), l: 'Giao dự kiến' },
            { v: deliveryLabel, l: 'Giao TB' },
          ].map((m) => (
            <div key={m.l} className="rounded-xl bg-[var(--color-surface)] p-2 text-center">
              <strong className="block text-xs font-bold">{m.v}</strong>
              <small className="text-[10px] text-[var(--color-muted)]">{m.l}</small>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Button className="w-full" onClick={() => openSheet(detail, Math.max(0, items.indexOf(detail)))}>
            Chọn món
          </Button>
        </div>
      </div>
    </div>
  );

  const storeHeader = store && (
    <div className="panel mb-3 p-4">
      <button type="button" onClick={() => navigate(-1)} className="mb-2 flex items-center gap-1 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"><ArrowLeft className="h-4 w-4" /> Quay lại</button>
      <div className="flex gap-3">
        <StoreAvatar name={store.shopName} src={store.avatarUrl} className="h-14 w-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">{store.shopName}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
              <span className="font-medium text-[var(--color-ink)]">{rating?.text}</span>
              {store.rating.count > 0 && <span>({store.rating.count} đánh giá)</span>}
            </span>
            {avgMins != null && (
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{deliveryLabel}</span>
            )}
            {store.openHours?.trim() && <span>· {store.openHours.trim()}</span>}
          </p>
          {(store.phone?.trim() || store.businessAddress?.trim()) && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {store.phone?.trim() && (
                <a href={`tel:${store.phone.trim()}`} className="font-medium text-brand-orange hover:underline">
                  {store.phone.trim()}
                </a>
              )}
              {store.phone?.trim() && store.businessAddress?.trim() && ' · '}
              {store.businessAddress?.trim()}
            </p>
          )}
          {areas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <StatusBadge key={a} variant="orange">{a}</StatusBadge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (pageLoading) return <p className="py-12 text-center font-bold text-[var(--color-muted)]">Đang tải...</p>;
  if (!store) return <EmptyMsg />;

  return (
    <>
      {storeHeader}
      {isMobile ? (
        <div className="space-y-3">{menuList}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[160px_1fr_240px] xl:grid-cols-[180px_minmax(0,1fr)_260px]">
          <div className="panel p-3 hidden lg:block">{categorySidebar}</div>
          <div className="space-y-4">{menuList}{detailPanel}</div>
          <div className="space-y-4">
            <StoreInfoCard
              shopName={store.shopName}
              rating={rating?.text ?? '—'}
              count={store.rating.count}
              phone={store.phone}
              openHours={store.openHours}
              businessAddress={store.businessAddress}
            />
            {(reviewsData?.data ?? []).length > 0 && (
              <div className="panel p-4">
                <h3 className="mb-3 font-bold">Đánh giá ({reviewsData?.data.length})</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {(reviewsData?.data ?? []).slice(0, 10).map((r) => (
                    <div key={r.id} className="border-b border-[var(--color-line)] pb-2 last:border-0">
                      <p className="flex items-center gap-1 text-sm font-semibold">
                        {r.buyerName}
                        <span className="text-yellow-400">{'★'.repeat(r.rating)}</span>
                      </p>
                      {r.comment && <p className="text-xs text-[var(--color-muted)]">{r.comment}</p>}
                      <ReviewTagList tags={r.tags} />
                      <p className="text-[10px] text-[var(--color-muted)]">{new Date(r.createdAt).toLocaleDateString('vi')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <FoodItemSheet
        item={sheetItem}
        imageIndex={selectedIndex}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onAdd={(p, action) => handleAdd(p, action)}
        loading={addMut.isPending || (Boolean(selectedId) && !foodDetail)}
      />
      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.item.imageUrl}
        images={lightbox?.item.imageUrls}
        alt={lightbox?.item.name ?? ''}
        index={lightbox?.i ?? 0}
        onClose={() => setLightbox(null)}
        onBuy={lightbox ? () => openSheet(lightbox.item, lightbox.i) : undefined}
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
        loading={addMut.isPending}
        onConfirm={() => pendingAdd && handleAdd(pendingAdd, pendingAdd.action, true)}
        onCancel={() => { setConflictOpen(false); setPendingAdd(null); }}
      />
    </>
  );
}

function EmptyMsg() {
  return (
    <div className="panel py-12 text-center">
      <p className="text-[var(--color-muted)]">Không tìm thấy quán</p>
      <Link to="/food" className="mt-2 inline-block text-brand-orange font-bold">Quay lại</Link>
    </div>
  );
}
