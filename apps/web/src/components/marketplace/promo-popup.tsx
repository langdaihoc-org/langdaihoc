import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { Banner } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { sanitizeLinkUrl, sanitizeImageUrl } from '@langdaihoc/shared';

const STORAGE_PREFIX = 'ldh-popup-dismissed:';
const EMPTY_BANNERS: Banner[] = [];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wasDismissedToday(bannerId: string) {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${bannerId}`);
    if (!stored) return false;
    // Chấp nhận cả key cũ không pad (2026-7-29) và key mới (2026-07-29)
    return stored === todayKey() || stored === legacyTodayKey();
  } catch {
    return false;
  }
}

function legacyTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dismissToday(bannerId: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${bannerId}`, todayKey());
  } catch {
    /* ignore */
  }
}

/** Popup quảng cáo kiểu Shopee — mỗi banner hiện tối đa 1 lần/ngày. */
export function PromoPopup({ banners }: { banners?: Banner[] | null }) {
  const list = banners?.length ? banners : EMPTY_BANNERS;
  const [banner, setBanner] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  /** Fingerprint ổn định — tránh `?? []` / refetch làm reset timer 600ms. */
  const listKey = useMemo(
    () => list.map((b) => `${b.id}:${b.isActive !== false ? 1 : 0}:${b.isPopup ? 1 : 0}`).join('|'),
    [list],
  );

  useEffect(() => {
    const eligible = list.filter(
      (b) => b.isActive !== false && b.isPopup === true && !wasDismissedToday(b.id),
    );
    const next = eligible[0] ?? null;
    if (!next) {
      setBanner(null);
      setOpen(false);
      return;
    }

    const t = window.setTimeout(() => {
      if (wasDismissedToday(next.id)) {
        setBanner(null);
        setOpen(false);
        return;
      }
      setBanner(next);
      setOpen(true);
    }, 600);

    return () => window.clearTimeout(t);
    // listKey = fingerprint nội dung; tránh restart khi chỉ đổi reference mảng
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [listKey]);

  const close = () => {
    if (banner) dismissToday(banner.id);
    setOpen(false);
  };

  const href = sanitizeLinkUrl(banner?.linkUrl, '/food');
  const imageUrl = sanitizeImageUrl(banner?.imageUrl);

  return (
    <Modal
      open={open && !!banner}
      onClose={close}
      titleId={titleId}
      zIndexClass="z-[90]"
      panelClassName="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-[var(--shadow-hover)]"
    >
      {banner && (
        <>
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 z-20 flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>

          <div className="relative flex h-52 items-end bg-gradient-to-br from-brand-orange to-brand-orange-dark p-5 text-white">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10">
              <p id={titleId} className="text-2xl font-bold leading-tight drop-shadow">
                {banner.title}
              </p>
              {banner.subtitle && (
                <p className="mt-1 text-sm text-white/90 drop-shadow">{banner.subtitle}</p>
              )}
            </div>
          </div>

          <div className="space-y-3 p-5">
            {banner.subtitle && !imageUrl && (
              <p className="text-sm text-[var(--color-muted)]">{banner.subtitle}</p>
            )}
            <Link to={href} onClick={close} className="block">
              <Button className="w-full" size="lg">
                {banner.ctaLabel || 'Xem ngay'}
              </Button>
            </Link>
            <button
              type="button"
              onClick={close}
              className="w-full min-h-11 text-center text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              Để sau
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
