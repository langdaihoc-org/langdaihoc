import { Link, Navigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { FoodProductManager, LaundryProductManager } from '@/components/seller/product-crud';
import { useSellerShop } from './seller-shared';

export function SellerProductsPage() {
  const { data, isLoading } = useSellerShop();
  const shop = data?.data;

  if (isLoading) {
    return <Card className="py-12 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>;
  }
  if (!shop) {
    return <Card className="py-12 text-center text-sm text-[var(--color-muted)]">Không tìm thấy cửa hàng</Card>;
  }

  const approved = shop.status === 'approved';
  if (shop.serviceTypes === 'ship_proxy') {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          Tài khoản nhận đồ ship hộ không quản lý sản phẩm — xử lý đơn ở mục Đơn hàng.
        </p>
        <Link to="/seller/orders" className="mt-3 inline-block text-sm font-semibold text-brand-orange">
          Xem đơn nhận hộ →
        </Link>
      </Card>
    );
  }
  if (shop.serviceTypes === 'laundry') {
    return <LaundryProductManager approved={approved} />;
  }
  return <FoodProductManager approved={approved} />;
}

export function SellerMenuPage() {
  return <Navigate to="/seller/products" replace />;
}

export function SellerLaundryPage() {
  return <Navigate to="/seller/products" replace />;
}
