import { BrandLogo } from '@/components/ui/brand';

/** Hero: logo + slogan (ô tìm nằm trên header / thanh mobile). */
export function HomeHeroSearch() {
  return (
    <section className="panel bg-grad-hero overflow-hidden p-5 sm:p-6">
      <div className="min-w-0">
        <BrandLogo showSlogan />
        <p className="mt-3 max-w-md text-left text-sm text-[var(--color-muted)]">
          Đặt đồ ăn, giặt đồ và nhận ship hộ quanh khu KTX.
        </p>
      </div>
    </section>
  );
}
