import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Phone, Star, Truck, WashingMachine } from 'lucide-react';
import type { LaundryService, Seller } from '@/lib/api';
import { formatPrice, formatRating } from '@/lib/format';
import { StoreAvatar } from './food-image';
import { StatusBadge } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';

const PREVIEW_COUNT = 4;

const UNIT_LABEL: Record<string, string> = {
  kg: 'kg',
  item: 'món',
  load: 'tải',
};

function LaundryServiceRow({
  service,
  onBook,
}: {
  service: LaundryService;
  onBook: () => void;
}) {
  return (
    <div className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3.5 last:border-0">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-green-50 text-brand-green">
        <WashingMachine className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold leading-snug">{service.name}</h4>
          <StatusBadge variant="green">Giá tạm tính</StatusBadge>
        </div>
        {service.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{service.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3.5 text-brand-green" /> Đến lấy · Giao lại
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> ~{service.estimatedTimeHours}h
          </span>
        </div>
        {service.serviceAreas && service.serviceAreas.length > 0 && (
          <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">
            Khu vực: {service.serviceAreas.join(', ')}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="font-bold text-brand-green">
            {formatPrice(service.basePrice)}
            <span className="text-sm font-normal text-[var(--color-muted)]">
              /{UNIT_LABEL[service.unit] ?? service.unit}
            </span>
          </p>
          <Button size="sm" variant="green" onClick={onBook}>
            Đặt lịch
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LaundryShopWithServices({
  store,
  services,
}: {
  store: Seller;
  services: LaundryService[];
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const rating = formatRating(store.rating.average, store.rating.count);
  const avgMins = store.avgDeliveryMinutes != null ? Number(store.avgDeliveryMinutes) : null;
  const areas = store.serviceAreas?.filter(Boolean) ?? [];

  const visible = expanded ? services : services.slice(0, PREVIEW_COUNT);
  const hasMore = services.length > PREVIEW_COUNT;

  const book = (serviceId: string) => {
    if (!isAuthenticated) {
      navigate('/auth/login');
      return;
    }
    navigate(`/laundry/book/${serviceId}`);
  };

  return (
    <section className="panel overflow-hidden p-0">
      <div className="flex gap-3 border-b border-[var(--color-line)] px-4 py-3.5">
        <StoreAvatar name={store.shopName} src={store.avatarUrl} className="size-14 shrink-0 rounded-xl sm:size-[72px]" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{store.shopName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
              <span className="font-medium text-[var(--color-ink)]">{rating.text}</span>
              {store.rating.count > 0 && <span>({store.rating.count})</span>}
            </span>
            {avgMins != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                ~{avgMins} phút
              </span>
            )}
            {store.openHours?.trim() && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {store.openHours.trim()}
              </span>
            )}
            <span>{services.length} dịch vụ</span>
          </div>
          {(store.phone?.trim() || store.businessAddress?.trim()) && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {store.phone?.trim() && (
                <a href={`tel:${store.phone.trim()}`} className="inline-flex items-center gap-1 font-medium text-brand-orange hover:underline">
                  <Phone className="size-3" />
                  {store.phone.trim()}
                </a>
              )}
              {store.phone?.trim() && store.businessAddress?.trim() && ' · '}
              {store.businessAddress?.trim() && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  <span className="line-clamp-1">{store.businessAddress.trim()}</span>
                </span>
              )}
            </p>
          )}
          {store.description && (
            <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">{store.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {areas.length > 0
              ? areas.slice(0, 4).map((a) => (
                  <StatusBadge key={a} variant="green">{a}</StatusBadge>
                ))
              : <StatusBadge variant="green">Giặt đồ</StatusBadge>}
          </div>
        </div>
      </div>

      {services.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">Tiệm chưa có dịch vụ</p>
      ) : (
        <>
          <div>
            {visible.map((svc) => (
              <LaundryServiceRow
                key={svc.id}
                service={svc}
                onBook={() => book(svc.id)}
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
                {expanded ? 'Thu gọn' : `Xem thêm ${services.length - PREVIEW_COUNT} dịch vụ`}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
