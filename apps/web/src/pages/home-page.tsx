import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Star, UtensilsCrossed, WashingMachine, Bike, ClipboardList,
} from 'lucide-react';
import { catalogApi, ordersApi } from '@/lib/api';
import { FoodGridCard } from '@/components/marketplace/store-card';
import { StoreAvatar } from '@/components/marketplace/food-image';
import { HomeHeroSearch } from '@/components/marketplace/home-hero';
import { LaundryCardCompact } from '@/components/marketplace/laundry-card';
import { BannerCarousel } from '@/components/marketplace/banner-carousel';
import { PromoPopup } from '@/components/marketplace/promo-popup';
import { FoodCardSkeleton } from '@/components/ui/skeleton';
import { formatRating, orderStatusLabel, orderTypeLabel, orderDisplayTitle } from '@/lib/format';
import { useAuth } from '@/contexts/auth-context';
import { Card } from '@/components/ui/card';
import { QueryErrorState } from '@/components/ui/query-state';
import { StatusBadge } from '@/components/ui/brand';

const ACTIVE_ORDER = new Set(['pending', 'accepted', 'preparing', 'delivering', 'picking_up', 'picked_up', 'waiting_price_confirmation', 'washing', 'returning']);
const HIDDEN_ORDER = new Set(['cancelled', 'rejected', 'needs_support']);

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const {
    data: home,
    isLoading: loadingHome,
    isError: errHome,
    refetch: refetchHome,
  } = useQuery({
    queryKey: ['catalog', 'home'],
    queryFn: () => catalogApi.home(),
    staleTime: 60_000,
  });
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'summary'],
    queryFn: () => ordersApi.list(1, 20, { view: 'summary' }),
    enabled: isAuthenticated,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const homeData = home?.data;
  const featured = (homeData?.food ?? []).slice(0, 8);
  const topStores = (homeData?.sellers ?? []).slice(0, 4);
  const laundryFeatured = (homeData?.laundry ?? []).slice(0, 6);
  const categories = homeData?.categories ?? [];
  const stripBanners = homeData?.banners ?? [];
  const popupBanners = homeData?.popupBanners ?? [];
  const loadingFood = loadingHome;
  const loadingLaundry = loadingHome;
  const loadingSellers = loadingHome;
  const errFood = errHome;
  const refetchFood = refetchHome;
  const activeOrders = (ordersData?.data ?? []).filter((o) => ACTIVE_ORDER.has(o.status) && !HIDDEN_ORDER.has(o.status)).slice(0, 3);

  return (
    <div className="space-y-6">
      <PromoPopup banners={popupBanners} />
      <HomeHeroSearch />

      <BannerCarousel banners={stripBanners} />

      {isAuthenticated && activeOrders.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardList className="size-5 text-brand-orange" /> Đơn đang xử lý
            </h2>
            <Link to="/orders" className="text-sm font-medium text-brand-orange">Xem tất cả</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {activeOrders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`}>
                <Card className="p-3 transition-shadow hover:shadow-[var(--shadow-hover)]">
                  <p className="font-semibold">{orderDisplayTitle(o)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {o.type === 'food' ? (
                      <span className="inline-flex items-center gap-1"><UtensilsCrossed className="size-3" /> {orderTypeLabel(o.type)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><WashingMachine className="size-3" /> {orderTypeLabel(o.type)}</span>
                    )}
                  </p>
                  <StatusBadge variant={o.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(o.status, o.type)}</StatusBadge>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/food" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-grad-food p-6 text-white shadow-md shadow-sky-500/25">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <UtensilsCrossed className="size-3.5" /> Ăn uống
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Đặt đồ ăn</h2>
              <p className="max-w-60 text-sm text-white/90">
                Quán quanh Làng ĐH, giao tại tòa hoặc rào.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Xem quán <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>

        <Link to="/laundry" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-grad-laundry p-6 text-white shadow-md shadow-cyan-500/20">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <WashingMachine className="size-3.5" /> Giặt đồ
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Đặt lịch giặt</h2>
              <p className="max-w-60 text-sm text-white/90">
                Lấy đồ, giặt sấy và giao lại.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Xem tiệm <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>

        <Link to="/ship" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-grad-ship p-6 text-white shadow-md shadow-blue-500/25">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <Bike className="size-3.5" /> Nhận đồ ship hộ
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Nhận ship hộ</h2>
              <p className="max-w-60 text-sm text-white/90">
                Nhờ lấy hàng và nhận lại tại KTX.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Đặt nhận hộ <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Categories */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Danh mục</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/food?category=${c.slug}`}
              className="shrink-0 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-brand-orange hover:text-brand-orange"
            >
              {c.name}
            </Link>
          ))}
          <Link
            to="/laundry"
            className="shrink-0 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-brand-green hover:text-brand-green"
          >
            Giặt đồ
          </Link>
        </div>
      </section>

      {/* Featured food */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Món ngon gần bạn</h2>
          <Link to="/food" className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange">
            Xem tất cả <ArrowRight className="size-4" />
          </Link>
        </div>
        {loadingFood ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <FoodCardSkeleton key={i} />)}
          </div>
        ) : errFood ? (
          <QueryErrorState message="Không tải được danh sách món" onRetry={() => refetchFood()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {featured.map((item, i) => (
              <FoodGridCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Laundry preview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Dịch vụ giặt — đến lấy & giao lại</h2>
          <Link to="/laundry" className="inline-flex items-center gap-1 text-sm font-medium text-brand-green">
            Xem tất cả <ArrowRight className="size-4" />
          </Link>
        </div>
        {loadingLaundry ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <FoodCardSkeleton key={i} />)}
          </div>
        ) : laundryFeatured.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {laundryFeatured.slice(0, 4).map((s, i) => (
              <LaundryCardCompact key={s.id} service={s} index={i} />
            ))}
          </div>
        ) : (
          <Card className="py-8 text-left text-sm text-[var(--color-muted)]">Chưa có dịch vụ giặt</Card>
        )}
      </section>

      {/* Partners */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Quán nổi bật</h2>
        {loadingSellers ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <FoodCardSkeleton key={i} />
            ))}
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topStores.map((s) => {
            const rating = formatRating(s.rating?.average, s.rating?.count);
            return (
              <Link key={s.id} to={`/store/${s.id}`}>
                <Card className="flex items-center gap-3 p-3 transition-shadow hover:shadow-[var(--shadow-hover)]">
                  <StoreAvatar name={s.shopName} src={s.avatarUrl} className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 font-semibold">{s.shopName}</h3>
                    <p className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                      <Star className="size-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
                      {rating.text}{s.rating.count > 0 && ` (${s.rating.count})`}
                    </p>
                    {s.businessAddress && <p className="line-clamp-1 text-xs text-[var(--color-muted)]">{s.businessAddress}</p>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
        )}
      </section>
    </div>
  );
}
