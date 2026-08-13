import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { LayoutDashboard, Package, UtensilsCrossed, WashingMachine, Store, Newspaper, CreditCard, Star, AlertTriangle, ClipboardList } from 'lucide-react';
import { ordersApi } from '@/lib/api';
import { DashboardShell, type DashboardLink } from '@/components/layout/dashboard-shell';
import { SellerNotificationBell } from '@/components/seller/seller-notification-bell';
import { useSellerOrdersLive, useSellerShop } from './seller-shared';

const SELLER_LINKS_BASE: DashboardLink[] = [
  { to: '/seller', label: 'Tổng quan', Icon: LayoutDashboard },
  { to: '/seller/orders', label: 'Đơn hàng', Icon: ClipboardList },
  { to: '/seller/posts', label: 'Bài đăng', Icon: Newspaper },
  { to: '/seller/bank', label: 'Ngân hàng', Icon: CreditCard },
  { to: '/seller/reviews', label: 'Đánh giá', Icon: Star },
  { to: '/seller/complaints', label: 'Khiếu nại', Icon: AlertTriangle },
  { to: '/seller/profile', label: 'Cửa hàng', Icon: Store },
];

const SELLER_MOBILE_MORE_BASE: DashboardLink[] = [
  { to: '/seller/bank', label: 'Ngân hàng', Icon: CreditCard },
  { to: '/seller/reviews', label: 'Đánh giá', Icon: Star },
  { to: '/seller/complaints', label: 'Khiếu nại', Icon: AlertTriangle },
  { to: '/seller/profile', label: 'Cửa hàng', Icon: Store },
];

function buildSellerNav(
  serviceTypes?: 'food' | 'laundry' | 'ship_proxy',
  opts?: { openOrderCount?: number; openComplaintCount?: number },
) {
  const isShip = serviceTypes === 'ship_proxy';
  const productPath = '/seller/products';
  const ProductIcon = serviceTypes === 'laundry' ? WashingMachine : UtensilsCrossed;
  const productLink: DashboardLink = { to: productPath, label: 'Sản phẩm', Icon: Package };
  const openOrderCount = opts?.openOrderCount ?? 0;
  const openComplaintCount = opts?.openComplaintCount ?? 0;
  const ordersLink: DashboardLink = {
    to: '/seller/orders',
    label: 'Đơn hàng',
    Icon: ClipboardList,
    badge: openOrderCount > 0 ? openOrderCount : undefined,
    emphasize: openOrderCount > 0,
  };
  const complaintsLink: DashboardLink = {
    to: '/seller/complaints',
    label: 'Khiếu nại',
    Icon: AlertTriangle,
    badge: openComplaintCount > 0 ? openComplaintCount : undefined,
    emphasize: openComplaintCount > 0,
  };

  const withBadges = (list: DashboardLink[]) =>
    list.map((l) => {
      if (l.to === '/seller/orders') return { ...l, ...ordersLink, Icon: l.Icon };
      if (l.to === '/seller/complaints') return { ...l, ...complaintsLink };
      return l;
    });

  const links = isShip
    ? withBadges(SELLER_LINKS_BASE)
    : (() => {
        const overviewIdx = SELLER_LINKS_BASE.findIndex((l) => l.to === '/seller');
        return withBadges([
          ...SELLER_LINKS_BASE.slice(0, overviewIdx + 1),
          productLink,
          ...SELLER_LINKS_BASE.slice(overviewIdx + 1),
        ]);
      })();

  const postsLink: DashboardLink = { to: '/seller/posts', label: 'Bài đăng', Icon: Newspaper };
  const mobilePrimary = isShip
    ? [
        { to: '/seller', label: 'Tổng quan', Icon: LayoutDashboard },
        {
          to: '/seller/orders',
          label: 'Đơn hàng',
          Icon: Package,
          badge: openOrderCount > 0 ? openOrderCount : undefined,
          emphasize: openOrderCount > 0,
        },
        postsLink,
        { to: '/seller/profile', label: 'Hồ sơ', Icon: Store },
      ]
    : [
        { to: '/seller', label: 'Tổng quan', Icon: LayoutDashboard },
        { to: productPath, label: 'Sản phẩm', Icon: ProductIcon },
        {
          to: '/seller/orders',
          label: 'Đơn hàng',
          Icon: Package,
          badge: openOrderCount > 0 ? openOrderCount : undefined,
          emphasize: openOrderCount > 0,
        },
        postsLink,
      ];

  return { links, mobilePrimary, mobileMore: withBadges(SELLER_MOBILE_MORE_BASE) };
}

export function SellerLayout() {
  useSellerOrdersLive({ notifyNew: true });
  const { data: shopData } = useSellerShop();
  const { data: pulseData } = useQuery({
    queryKey: ['seller-orders-pulse'],
    queryFn: () => ordersApi.pulse(),
    staleTime: 4_000,
  });
  const pending = shopData?.data?.status !== 'approved';
  const closed = shopData?.data?.acceptingOrders === false;
  const openOrderCount = pulseData?.data?.openCount ?? 0;
  const openComplaintCount = pulseData?.data?.openComplaintCount ?? 0;
  const nav = buildSellerNav(shopData?.data?.serviceTypes, { openOrderCount, openComplaintCount });
  return (
    <DashboardShell
      title="Trung tâm người bán"
      subtitle={shopData?.data?.shopName ?? 'Quản lý cửa hàng'}
      links={nav.links}
      homeTo="/seller"
      accent="green"
      mobilePrimary={nav.mobilePrimary}
      mobileMore={nav.mobileMore}
      headerExtra={<SellerNotificationBell />}
    >
      {pending && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cửa hàng đang chờ admin duyệt. Bạn có thể cập nhật hồ sơ, nhưng chưa thể thêm/sửa món, dịch vụ hay tài khoản ngân hàng.
        </div>
      )}
      {closed && !pending && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Quán đang tạm đóng — khách không thấy quán và không đặt được đơn mới. Đơn đang chạy vẫn xử lý bình thường.
        </div>
      )}
      <Outlet context={{ shopApproved: !pending }} />
    </DashboardShell>
  );
}
