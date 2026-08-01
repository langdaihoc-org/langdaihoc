import { Clock, MapPin, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Khối thông tin liên hệ quán — dùng trên trang đặt hàng / chi tiết quán */
export function ShopContactCard({
  shopName,
  phone,
  businessAddress,
  openHours,
  className,
}: {
  shopName?: string | null;
  phone?: string | null;
  businessAddress?: string | null;
  openHours?: string | null;
  className?: string;
}) {
  const hasAny = Boolean(phone?.trim() || businessAddress?.trim() || openHours?.trim());
  if (!hasAny && !shopName) return null;

  return (
    <div className={cn('rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm', className)}>
      <p className="mb-2 font-semibold">{shopName ? `Liên hệ · ${shopName}` : 'Thông tin quán'}</p>
      <ul className="space-y-1.5 text-[var(--color-muted)]">
        {phone?.trim() && (
          <li className="flex items-start gap-2">
            <Phone className="mt-0.5 size-3.5 shrink-0 text-brand-orange" />
            <a href={`tel:${phone.trim()}`} className="font-medium text-brand-orange hover:underline">
              {phone.trim()}
            </a>
          </li>
        )}
        {openHours?.trim() && (
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="text-[var(--color-ink)]">Giờ hoạt động: </span>
              {openHours.trim()}
            </span>
          </li>
        )}
        {businessAddress?.trim() && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span>{businessAddress.trim()}</span>
          </li>
        )}
        {!phone?.trim() && !openHours?.trim() && !businessAddress?.trim() && (
          <li className="text-xs">Quán chưa cập nhật SĐT / giờ hoạt động.</li>
        )}
      </ul>
    </div>
  );
}
