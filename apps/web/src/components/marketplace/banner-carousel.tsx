import { useEffect, useState } from 'react';
import type { Banner } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SafeNavLink } from '@/components/ui/safe-nav-link';
import { sanitizeLinkUrl, sanitizeImageUrl } from '@langdaihoc/shared';

/** Carousel banner ngang trên home. */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const items = banners.filter((b) => b.isActive !== false && !b.isPopup);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % items.length), 4500);
    return () => window.clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[Math.min(idx, items.length - 1)]!;
  const href = sanitizeLinkUrl(current.linkUrl, '/food');
  const imageUrl = sanitizeImageUrl(current.imageUrl);

  return (
    <section className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
      <SafeNavLink to={href} className="block">
        <div className="relative flex h-36 items-end sm:h-44">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="absolute inset-0 bg-grad-food" />
          )}
          <div className="absolute inset-0 bg-grad-scrim" />
          <div className="relative z-10 p-5 text-white">
            <p className="text-lg font-bold drop-shadow sm:text-xl">{current.title}</p>
            {current.subtitle && (
              <p className="mt-0.5 text-sm text-white/90 drop-shadow">{current.subtitle}</p>
            )}
            <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              {current.ctaLabel || 'Xem ngay'}
            </span>
          </div>
        </div>
      </SafeNavLink>
      {items.length > 1 && (
        <div className="absolute bottom-3 right-4 z-10 flex gap-1.5">
          {items.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              onClick={() => setIdx(i)}
              className={cn(
                'size-2 rounded-full transition',
                i === idx ? 'bg-white' : 'bg-white/45',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
