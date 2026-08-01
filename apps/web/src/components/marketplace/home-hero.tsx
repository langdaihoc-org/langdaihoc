import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand';

/** Hero: logo, slogan, search. */
export function HomeHeroSearch() {
  const navigate = useNavigate();

  return (
    <section className="panel overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-50/60 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <BrandLogo showSlogan />
          <p className="mt-3 max-w-md text-left text-sm text-[var(--color-muted)]">
            Đặt đồ ăn, giặt đồ và nhận ship hộ quanh khu KTX.
          </p>
        </div>
        <form
          className="w-full sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
            navigate(q ? `/food?q=${encodeURIComponent(q)}` : '/food');
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              name="q"
              aria-label="Tìm món ăn, quán, dịch vụ"
              placeholder="Tìm món ăn, quán, dịch vụ..."
              className="h-12 w-full rounded-2xl border border-[var(--color-line)] bg-white pl-11 pr-4 text-sm shadow-sm outline-none transition-colors focus:border-brand-orange/60 focus-visible:ring-2 focus-visible:ring-brand-orange/40"
            />
          </div>
        </form>
      </div>
    </section>
  );
}
