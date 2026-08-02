import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { cartApi } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useAuth } from '@/contexts/auth-context';

export function StickyCartBar({ bottomOffset = 'bottom-16' }: { bottomOffset?: string }) {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({ queryKey: ['cart'], queryFn: () => cartApi.get(), enabled: isAuthenticated });
  const cart = data?.data;
  const count = cart?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const fingerprint = cart ? `${count}|${cart.subtotal}|${cart.sellerId ?? ''}` : '';
  const [dismissedFp, setDismissedFp] = useState<string | null>(null);

  useEffect(() => {
    // Giỏ đổi (thêm/bớt món) → hiện lại thanh
    setDismissedFp(null);
  }, [fingerprint]);

  if (!isAuthenticated || !cart?.items?.length) return null;
  if (dismissedFp === fingerprint) return null;

  return (
    <div className={`fixed left-0 right-0 z-30 ${bottomOffset}`}>
      <div className="mx-auto max-w-lg px-3">
        <div className="relative flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <button
            type="button"
            aria-label="Ẩn thanh giỏ hàng"
            className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--color-muted)] shadow-sm hover:text-[var(--color-ink)]"
            onClick={() => setDismissedFp(fingerprint)}
          >
            <X className="size-3.5" />
          </button>
          <div className="min-w-0 pr-4">
            <p className="truncate text-sm font-semibold">{cart.shopName}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {count} món · <span className="font-semibold text-brand-orange-dark">{formatPrice(cart.subtotal)}</span>
            </p>
          </div>
          <Link
            to="/cart"
            className="shrink-0 rounded-full bg-brand-orange-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#072a4d]"
          >
            Xem giỏ
          </Link>
        </div>
      </div>
    </div>
  );
}
