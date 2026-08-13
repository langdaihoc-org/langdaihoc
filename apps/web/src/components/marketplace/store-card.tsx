import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Plus, Star } from 'lucide-react';
import type { FoodItem, Seller } from '@/lib/api';
import { formatRating, formatPrice, deliveryEta } from '@/lib/format';
import { FoodImage, StoreAvatar } from './food-image';
import { StatusBadge } from '@/components/ui/brand';

export function StoreCard({ store }: { store: Seller; index?: number }) {
  const rating = formatRating(store.rating?.average, store.rating?.count);
  const avgMins = store.avgDeliveryMinutes != null ? Number(store.avgDeliveryMinutes) : null;
  const areas = store.serviceAreas?.filter(Boolean) ?? [];

  return (
    <Link
      to={`/store/${store.id}`}
      className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3.5 transition-colors last:border-0 hover:bg-black/[0.02]"
    >
      <StoreAvatar name={store.shopName} src={store.avatarUrl} className="size-[76px] shrink-0 rounded-xl" />
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
        </div>
        {store.description && <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">{store.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {areas.length > 0
            ? areas.slice(0, 3).map((a) => (
                <StatusBadge key={a} variant={store.serviceTypes === 'laundry' ? 'green' : 'orange'}>{a}</StatusBadge>
              ))
            : store.serviceTypes === 'laundry'
              ? <StatusBadge variant="green">Giặt đồ</StatusBadge>
              : null}
        </div>
      </div>
    </Link>
  );
}

export function FoodGridCard({ item, index, onAdd }: { item: FoodItem; index: number; onAdd?: () => void }) {
  return (
    <div className="group panel overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-hover)]">
      <Link to={`/store/${item.sellerId}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-orange-50">
          <FoodImage
            src={item.imageUrl}
            index={index}
            alt={item.name}
            className="transition-transform duration-300 group-hover:scale-105"
            priority={index < 4}
          />
        </div>
      </Link>
      <div className="flex flex-col gap-1.5 p-3">
        <Link to={`/store/${item.sellerId}`}>
          <h3 className="line-clamp-1 font-semibold">{item.name}</h3>
        </Link>
        <p className="line-clamp-1 text-xs text-[var(--color-muted)]">{item.shopName}</p>
        <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <Clock className="size-3.5" />
          {deliveryEta(item.prepTimeMinutes)}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-bold text-brand-orange">{formatPrice(item.price)}</span>
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label="Mua ngay"
              className="flex size-11 items-center justify-center rounded-full bg-brand-orange-dark text-white hover:bg-[#072a4d]"
            >
              <Plus className="size-4" />
            </button>
          ) : (
            <Link
              to={`/store/${item.sellerId}`}
              aria-label="Xem quán"
              className="flex size-11 items-center justify-center rounded-full bg-brand-orange-dark text-white hover:bg-[#072a4d]"
            >
              <Plus className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function MenuItemRow({
  name, description, price, imageIndex, imageUrl, onAdd, onImageClick, badge,
}: {
  name: string; description?: string; price: number; imageIndex: number;
  imageUrl?: string | null; onAdd: () => void; onImageClick?: () => void; badge?: string;
}) {
  return (
    <div className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3.5 last:border-0">
      <button
        type="button"
        onClick={onImageClick ?? onAdd}
        className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-orange-50 ring-1 ring-black/5"
        aria-label={`Xem ảnh ${name}`}
      >
        <FoodImage src={imageUrl} index={imageIndex} alt={name} />
        {badge && <span className="absolute left-1 top-1 badge-orange text-[9px]">{badge}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" className="w-full text-left" onClick={onAdd}>
          <h4 className="font-semibold leading-snug">{name}</h4>
          {description && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{description}</p>}
        </button>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="font-bold text-brand-orange">{formatPrice(price)}</span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Chọn ${name}`}
            className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-brand-orange transition-colors hover:bg-brand-orange hover:text-white"
          >
            <Plus className="size-3.5" />
            Chọn
          </button>
        </div>
      </div>
    </div>
  );
}

export function StoreInfoCard({
  shopName, rating, count, phone, openHours, businessAddress,
}: {
  shopName: string; rating: string; count: number;
  phone?: string | null; openHours?: string | null; businessAddress?: string | null;
}) {
  return (
    <aside className="hidden space-y-3 lg:block">
      <div className="panel p-4">
        <h3 className="mb-3 font-semibold">Thông tin cửa hàng</h3>
        <div className="mb-3 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl bg-orange-50 text-2xl">🏪</div>
          <div>
            <strong className="block font-semibold">{shopName}</strong>
            <span className="text-xs font-medium text-[var(--color-muted)]">
              <Star className="mr-0.5 inline size-3 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
              {rating}{count > 0 && ` (${count}+)`}
            </span>
          </div>
        </div>
        {(phone || openHours || businessAddress) && (
          <div className="space-y-1.5 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-muted)]">
            {phone && (
              <p>
                SĐT:{' '}
                <a href={`tel:${phone}`} className="font-semibold text-brand-orange hover:underline">{phone}</a>
              </p>
            )}
            {openHours && <p>Giờ hoạt động: <span className="text-[var(--color-ink)]">{openHours}</span></p>}
            {businessAddress && <p>{businessAddress}</p>}
          </div>
        )}
      </div>
      <div className="panel p-4">
        <h3 className="mb-2 font-semibold">Cam kết</h3>
        {['Giao đúng giờ', 'Chất lượng đảm bảo', 'Hỗ trợ nhanh'].map((t) => (
          <div key={t} className="mb-1 flex gap-2 text-sm text-[var(--color-muted)]">
            <span className="text-brand-green">✓</span>{t}
          </div>
        ))}
      </div>
    </aside>
  );
}
