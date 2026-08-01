import { useEffect, useId, useRef, useState } from 'react';
import { X, Minus, Plus, ShoppingBag, Zap, Store, ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import type { FoodItem, FoodOptionGroup } from '@/lib/api';
import { formatPrice, getFoodImage } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { FoodImage } from './food-image';

export type FoodSheetAction = 'cart' | 'buy';

function foodItemImages(item: FoodItem, fallbackIndex: number): string[] {
  const urls = [...(item.imageUrls ?? [])].filter((u) => u?.trim());
  if (item.imageUrl?.trim() && !urls.includes(item.imageUrl.trim())) {
    urls.unshift(item.imageUrl.trim());
  }
  if (urls.length === 0) return [getFoodImage(fallbackIndex)];
  return urls.slice(0, 10);
}

function validateGroups(groups: FoodOptionGroup[], selected: string[]): string | null {
  for (const group of groups) {
    if (group.id === 'optional') continue;
    const picked = group.options.filter((o) => selected.includes(o.id)).length;
    if (group.required && picked < Math.max(1, group.minSelect)) {
      return `Vui lòng chọn "${group.name}"`;
    }
    if (picked < group.minSelect) {
      return `Chọn tối thiểu ${group.minSelect} trong "${group.name}"`;
    }
    if (picked > group.maxSelect) {
      return `Chọn tối đa ${group.maxSelect} trong "${group.name}"`;
    }
  }
  return null;
}

function toggleOption(
  group: FoodOptionGroup,
  optId: string,
  selected: string[],
): string[] {
  const inGroup = group.options.map((o) => o.id);
  const pickedInGroup = selected.filter((id) => inGroup.includes(id));
  const isSelected = selected.includes(optId);

  if (group.maxSelect === 1) {
    const withoutGroup = selected.filter((id) => !inGroup.includes(id));
    return isSelected ? withoutGroup : [...withoutGroup, optId];
  }

  if (isSelected) return selected.filter((id) => id !== optId);
  if (pickedInGroup.length >= group.maxSelect) return selected;
  return [...selected, optId];
}

/** Lightbox toàn màn — vuốt / mũi tên xem ảnh */
function FoodGalleryLightbox({
  images,
  index,
  alt,
  onClose,
  onIndexChange,
}: {
  images: string[];
  index: number;
  alt: string;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const total = images.length;
  const safeIndex = ((index % total) + total) % total;

  const go = (delta: number) => {
    if (total <= 1) return;
    onIndexChange((safeIndex + delta + total) % total);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [safeIndex, total, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/94">
      <div className="flex items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="text-sm font-medium tabular-nums">
          {safeIndex + 1} / {total}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-white/10"
          aria-label="Đóng"
        >
          <X className="size-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
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
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 z-10 flex size-10 items-center justify-center rounded-full bg-white/15 text-white"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 z-10 flex size-10 items-center justify-center rounded-full bg-white/15 text-white"
              aria-label="Ảnh sau"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
        <img
          src={images[safeIndex]}
          alt={alt}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-1.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ảnh ${i + 1}`}
              onClick={() => onIndexChange(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === safeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/40',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FoodImageCarousel({
  images,
  alt,
  activeIndex,
  onIndexChange,
  onExpand,
}: {
  images: string[];
  alt: string;
  activeIndex: number;
  onIndexChange: (i: number) => void;
  onExpand: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const total = images.length;
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(total - 1, 0));

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[safeIndex] as HTMLElement | undefined;
    if (child) {
      el.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
  }, [safeIndex]);

  const go = (delta: number) => {
    if (total <= 1) return;
    onIndexChange((safeIndex + delta + total) % total);
  };

  return (
    <div className="relative bg-orange-50">
      <div
        ref={scrollerRef}
        className="flex h-52 snap-x snap-mandatory overflow-x-auto scroll-smooth sm:h-56 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
          if (i !== safeIndex && i >= 0 && i < total) onIndexChange(i);
        }}
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          // scroll-snap handles most cases; this helps when scroll doesn't fire mid-snap
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || total <= 1) return;
          const dx = end - start;
          if (Math.abs(dx) < 50) return;
          // let snap settle; index updates via onScroll
        }}
      >
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            className="relative h-full min-w-full shrink-0 snap-center"
            onClick={onExpand}
            aria-label={`Xem ảnh lớn ${i + 1}`}
          >
            <FoodImage src={src} index={i} alt={`${alt} (${i + 1})`} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onExpand}
        className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
      >
        <Expand className="size-3.5" />
        {total > 1 ? `${safeIndex + 1}/${total}` : 'Phóng to'}
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm sm:flex"
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm sm:flex"
            aria-label="Ảnh sau"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-3 right-3 z-10 flex gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ảnh ${i + 1}`}
                onClick={() => onIndexChange(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/55',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FoodItemSheet({
  item, imageIndex, open, onClose, onAdd, loading,
}: {
  item: FoodItem | null; imageIndex: number; open: boolean;
  onClose: () => void;
  onAdd: (p: { quantity: number; options: string[]; note: string }, action: FoodSheetAction) => void;
  loading?: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<FoodSheetAction | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const titleId = useId();
  const noteId = useId();

  const images = item ? foodItemImages(item, imageIndex) : [];

  useEffect(() => {
    if (!open || !item) return;
    setQty(1);
    setSelected([]);
    setNote('');
    setError(null);
    setPendingAction(null);
    setPhotoIndex(0);
    setGalleryOpen(false);
  }, [open, item?.id]);

  const groups: FoodOptionGroup[] =
    item?.optionGroups?.length
      ? item.optionGroups
      : (item?.options?.length
          ? [{ id: 'optional', name: 'Tùy chọn thêm', required: false, minSelect: 0, maxSelect: item.options.length, options: item.options }]
          : []);

  const allOptions = groups.flatMap((g) => g.options);
  const optionTotal = allOptions.filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.priceDelta, 0);
  const unitPrice = Number(item?.price ?? 0) + optionTotal;
  const total = unitPrice * qty;

  const submit = (action: FoodSheetAction) => {
    if (!item) return;
    const err = validateGroups(groups, selected);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPendingAction(action);
    // Gửi đúng thứ tự nhóm → option trên menu (không theo lúc bấm)
    const ordered = groups.flatMap((g) => g.options.map((o) => o.id)).filter((id) => selected.includes(id));
    onAdd({ quantity: qty, options: ordered, note }, action);
  };

  return (
    <>
      <Modal
        open={open && !!item}
        onClose={onClose}
        titleId={titleId}
        zIndexClass="z-[90]"
        panelClassName="grid w-full max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-3xl bg-white shadow-2xl max-h-[min(92dvh,720px)] sm:rounded-3xl"
      >
        {item && (
          <>
            <div className="relative shrink-0">
              <FoodImageCarousel
                images={images}
                alt={item.name}
                activeIndex={photoIndex}
                onIndexChange={setPhotoIndex}
                onExpand={() => setGalleryOpen(true)}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-full bg-white/95 shadow-sm hover:bg-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-lg font-bold leading-snug text-[var(--color-ink)]">
                    {item.name}
                  </h2>
                  {item.shopName && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      <Store className="size-3.5 shrink-0" />
                      <span className="truncate">{item.shopName}</span>
                      {item.prepTimeMinutes > 0 && (
                        <span className="shrink-0">· ~{item.prepTimeMinutes} phút</span>
                      )}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-lg font-bold text-brand-orange-dark">
                  {formatPrice(item.price)}
                </p>
              </div>

              {item.description && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  {item.description}
                </p>
              )}

              {groups.map((group) => (
                <div key={group.id} className="mt-5">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{group.name}</h4>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        group.required ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-brand-orange',
                      )}
                    >
                      {group.required ? 'Bắt buộc' : 'Tuỳ chọn'}
                    </span>
                    {group.maxSelect > 1 && (
                      <span className="text-[10px] text-[var(--color-muted)]">
                        Chọn {group.minSelect > 0 ? `${group.minSelect}–` : 'tối đa '}{group.maxSelect}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt) => {
                      const isSelected = selected.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelected((p) => toggleOption(group, opt.id, p))}
                          className={cn(
                            'flex min-h-11 items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                            isSelected
                              ? 'border-brand-orange bg-orange-50/50'
                              : 'border-[var(--color-line)] bg-white hover:border-brand-orange/40',
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center border-2',
                                isSelected ? 'border-brand-orange bg-brand-orange text-white' : 'border-[var(--color-muted)]/40',
                                group.maxSelect === 1 ? 'rounded-full' : 'rounded-md',
                              )}
                            >
                              {isSelected && (
                                <span className={cn(group.maxSelect === 1 ? 'size-2 rounded-full' : 'size-2.5 rounded-sm', 'bg-current')} />
                              )}
                            </span>
                            {opt.name}
                          </span>
                          {opt.priceDelta > 0 && (
                            <span className="shrink-0 text-[var(--color-muted)]">+{formatPrice(opt.priceDelta)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="mt-5">
                <label htmlFor={noteId} className="mb-2 block text-sm font-semibold">Ghi chú cho quán</label>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: ít cay, không hành..."
                  rows={2}
                  className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm outline-none transition-colors focus:border-brand-orange/50"
                />
              </div>
              {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            </div>

            <div className="shrink-0 border-t border-[var(--color-line)] bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-0.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
                  <button
                    type="button"
                    aria-label="Giảm"
                    className="flex size-10 items-center justify-center rounded-full hover:bg-white disabled:opacity-40"
                    disabled={qty <= 1}
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    aria-label="Tăng"
                    className="flex size-10 items-center justify-center rounded-full hover:bg-white"
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[11px] text-[var(--color-muted)]">Tạm tính</p>
                  <p className="text-lg font-bold tabular-nums text-brand-orange-dark">{formatPrice(total)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 border-brand-orange/35 text-brand-orange-dark hover:bg-orange-50"
                  loading={loading && pendingAction === 'cart'}
                  disabled={loading}
                  onClick={() => submit('cart')}
                >
                  <ShoppingBag className="size-4" />
                  Thêm giỏ
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-12"
                  loading={loading && pendingAction === 'buy'}
                  disabled={loading}
                  onClick={() => submit('buy')}
                >
                  <Zap className="size-4" />
                  Mua ngay
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {galleryOpen && images.length > 0 && (
        <FoodGalleryLightbox
          images={images}
          index={photoIndex}
          alt={item?.name ?? ''}
          onClose={() => setGalleryOpen(false)}
          onIndexChange={setPhotoIndex}
        />
      )}
    </>
  );
}

export function TimeSlotPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (slot: string) => void }) {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const titleId = useId();
  const slots = ['10:00 → 10:40', '11:00 → 11:40', '12:00 → 12:40', '17:00 → 17:40', '18:00 → 18:40', '19:00 → 19:40'];
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={titleId}
      zIndexClass="z-[90]"
      panelClassName="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"
    >
      <h3 id={titleId} className="mb-3 font-bold">Chọn khoảng thời gian giao</h3>
      <div className="mb-3 flex gap-2">
        {(['today', 'tomorrow'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={day === d}
            className={cn(
              'flex-1 rounded-full border py-2 text-sm font-semibold transition-colors',
              day === d ? 'border-transparent bg-brand-orange-dark text-white' : 'border-[var(--color-line)]',
            )}
          >
            {d === 'today' ? 'Hôm nay' : 'Ngày mai'}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
        {slots.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { onSelect(`${day}:${s}`); onClose(); }}
            className="min-h-11 rounded-xl border border-[var(--color-line)] py-2.5 text-xs font-medium transition-colors hover:border-brand-orange hover:bg-orange-50"
          >
            {s}
          </button>
        ))}
      </div>
    </Modal>
  );
}
