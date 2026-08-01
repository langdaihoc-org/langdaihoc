import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Star, X } from 'lucide-react';
import type { FoodItem, Seller } from '@/lib/api';
import { formatRating } from '@/lib/format';
import { StoreAvatar, FoodImage } from './food-image';
import { MenuItemRow } from './store-card';
import { StatusBadge } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';

const PREVIEW_COUNT = 4;

export function ImageLightbox({
  open,
  src,
  images,
  alt,
  index = 0,
  onClose,
  onBuy,
}: {
  open: boolean;
  src?: string | null;
  images?: string[];
  alt: string;
  index?: number;
  onClose: () => void;
  onBuy?: () => void;
}) {
  const urls = (images?.length ? images : src ? [src] : []).filter(Boolean) as string[];
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (open) setI(0);
  }, [open, alt]);

  if (!open) return null;
  const total = Math.max(urls.length, 1);
  const safe = ((i % total) + total) % total;
  const current = urls[safe] ?? null;

  const go = (delta: number) => {
    if (total <= 1) return;
    setI((safe + delta + total) % total);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Đóng" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label="Đóng"
        >
          <X className="size-5" />
        </button>
        <div
          className="relative aspect-square bg-orange-50"
          onTouchStart={(e) => {
            touchX.current = e.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start == null || end == null) return;
            const dx = end - start;
            if (Math.abs(dx) < 40) return;
            go(dx < 0 ? 1 : -1);
          }}
        >
          <FoodImage src={current} index={index + safe} alt={alt} className="h-full w-full object-cover" />
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white"
                aria-label="Ảnh trước"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white"
                aria-label="Ảnh sau"
              >
                <ChevronRight className="size-5" />
              </button>
              <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                {safe + 1}/{total}
              </p>
            </>
          )}
        </div>
        <div className="space-y-3 p-4">
          <p className="font-semibold">{alt}</p>
          {onBuy && (
            <Button className="w-full" onClick={() => { onClose(); onBuy(); }}>
              Chọn món
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function StoreWithMenu({
  store,
  items,
  index,
  onAddItem,
}: {
  store: Seller;
  items: FoodItem[];
  index: number;
  onAddItem: (item: FoodItem, itemIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{ item: FoodItem; i: number } | null>(null);
  const rating = formatRating(store.rating.average, store.rating.count);
  const avgMins = store.avgDeliveryMinutes != null ? Number(store.avgDeliveryMinutes) : null;
  const areas = store.serviceAreas?.filter(Boolean) ?? [];

  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hasMore = items.length > PREVIEW_COUNT;

  return (
    <section className="panel overflow-hidden p-0">
      <Link
        to={`/store/${store.id}`}
        className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3.5 transition-colors hover:bg-black/[0.02]"
      >
        <StoreAvatar name={store.shopName} src={store.avatarUrl} className="size-14 shrink-0 rounded-xl sm:size-[72px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{store.shopName}</h3>
            <ChevronRight className="size-4 shrink-0 text-[var(--color-muted)]" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
              <span className="font-medium text-[var(--color-ink)]">{rating.text}</span>
              {store.rating.count > 0 && <span>({store.rating.count})</span>}
            </span>
            {avgMins != null && (
              <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />~{avgMins} phút</span>
            )}
            <span>{items.length} món</span>
          </div>
          {store.description && (
            <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">{store.description}</p>
          )}
          {areas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {areas.slice(0, 4).map((a) => (
                <StatusBadge key={a} variant="orange">{a}</StatusBadge>
              ))}
            </div>
          )}
        </div>
      </Link>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">Quán chưa có món</p>
      ) : (
        <>
          <div>
            {visible.map((item, i) => (
              <MenuItemRow
                key={item.id}
                name={item.name}
                description={item.description}
                price={item.price}
                imageIndex={index * 10 + i}
                imageUrl={item.imageUrl}
                onAdd={() => onAddItem(item, i)}
                onImageClick={() => setPreview({ item, i })}
              />
            ))}
          </div>
          {hasMore && (
            <div className="border-t border-[var(--color-line)] px-4 py-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Thu gọn' : `Xem thêm ${items.length - PREVIEW_COUNT} món`}
              </Button>
            </div>
          )}
        </>
      )}

      <ImageLightbox
        open={!!preview}
        src={preview?.item.imageUrl}
        alt={preview?.item.name ?? ''}
        index={preview ? index * 10 + preview.i : 0}
        onClose={() => setPreview(null)}
        onBuy={preview ? () => onAddItem(preview.item, preview.i) : undefined}
      />
    </section>
  );
}
