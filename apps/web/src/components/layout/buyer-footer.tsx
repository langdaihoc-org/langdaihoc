import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/ui/brand';

const SITE_URL = 'https://langdaihoc.com.vn';
const SUPPORT_EMAIL = 'hotro@langdaihoc.com.vn';

export function BuyerFooter() {
  return (
    <footer className="mt-10 border-t border-[var(--color-line)] bg-white md:mt-12">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 sm:gap-8 sm:px-6 md:py-12 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <BrandLogo showSlogan />
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            Đặt đồ ăn, giặt đồ và nhận ship hộ quanh khu Làng Đại Học — nhanh, gọn, đúng giờ.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Dịch vụ</h4>
          <Link to="/food" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">Ăn uống</Link>
          <Link to="/laundry" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">Giặt đồ</Link>
          <Link to="/ship" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">Nhận đồ ship hộ</Link>
          <Link to="/orders" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">Theo dõi đơn</Link>
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Hỗ trợ</h4>
          <p className="text-sm text-[var(--color-muted)]">Khu Làng Đại Học, Thủ Đức</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-sm text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            langdaihoc.com.vn
          </a>
          <p className="text-sm text-[var(--color-muted)]">
            Khiếu nại đơn:{' '}
            <Link to="/orders" className="font-medium text-[var(--color-ink)] underline-offset-2 hover:underline">
              Đơn hàng của bạn
            </Link>
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--color-line)] py-4 text-center text-xs text-[var(--color-muted)]">
        © {new Date().getFullYear()} langdaihoc ·{' '}
        <a href={SITE_URL} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          langdaihoc.com.vn
        </a>
      </div>
    </footer>
  );
}
