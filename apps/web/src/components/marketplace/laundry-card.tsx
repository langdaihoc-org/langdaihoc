import { Link } from 'react-router-dom';
import { Clock, ArrowRight, Truck, Plus } from 'lucide-react';
import type { LaundryService } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/brand';
import { FoodImage } from '@/components/marketplace/food-image';
import { cn } from '@/lib/utils';

export function LaundryCard({
  service,
  index = 0,
  className,
  onBook,
}: {
  service: LaundryService;
  index?: number;
  className?: string;
  onBook?: () => void;
}) {
  const content = (
    <Card className={cn('flex gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-hover)]', className)}>
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-green-50">
        <FoodImage src={service.imageUrl} index={index} alt={service.name} type="laundry" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{service.name}</h3>
            <p className="text-xs text-[var(--color-muted)]">{service.shopName}</p>
          </div>
          <StatusBadge variant="green">Giá tạm tính</StatusBadge>
        </div>
        <p className="mt-2 text-lg font-bold text-brand-green">
          {formatPrice(service.basePrice)}
          <span className="text-sm font-normal text-[var(--color-muted)]">/{service.unit}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3.5 text-brand-green" /> Đến lấy · Giao lại
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> ~{service.estimatedTimeHours}h
          </span>
        </div>
        {service.description && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">{service.description}</p>
        )}
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-[var(--color-muted)]" />
    </Card>
  );

  if (onBook) {
    return (
      <button type="button" onClick={onBook} className="w-full text-left">
        {content}
      </button>
    );
  }

  return (
    <Link to={`/laundry/book/${service.id}`} className="block">
      {content}
    </Link>
  );
}

/** Grid card giống FoodGridCard — ảnh trên, giá + nút + */
export function LaundryCardCompact({
  service,
  index = 0,
}: {
  service: LaundryService;
  index?: number;
}) {
  return (
    <div className="group panel overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-hover)]">
      <Link to={`/laundry/book/${service.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-green-50">
          <FoodImage
            src={service.imageUrl}
            index={index}
            alt={service.name}
            type="laundry"
            className="transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </Link>
      <div className="flex flex-col gap-1.5 p-3">
        <Link to={`/laundry/book/${service.id}`}>
          <h3 className="line-clamp-1 font-semibold">{service.name}</h3>
        </Link>
        <p className="line-clamp-1 text-xs text-[var(--color-muted)]">{service.shopName}</p>
        <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <Clock className="size-3.5" />
          ~{service.estimatedTimeHours}h · lấy & giao
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-bold text-brand-green">
            {formatPrice(service.basePrice)}
            <span className="text-xs font-normal text-[var(--color-muted)]">/{service.unit}</span>
          </span>
          <Link
            to={`/laundry/book/${service.id}`}
            aria-label={`Đặt ${service.name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-green text-white hover:bg-brand-green-dark"
          >
            <Plus className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
