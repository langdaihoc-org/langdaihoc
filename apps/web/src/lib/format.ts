import {
  serviceTypeLabel,
  orderTypeLabel,
  formatOrderSummary,
  sellerStatusLabel,
  orderStatusLabel,
  paymentStatusLabel,
  paymentMethodLabel,
  postStatusLabel,
  complaintStatusLabel,
  localizeNotificationText,
} from '@langdaihoc/shared';

export {
  serviceTypeLabel,
  orderTypeLabel,
  formatOrderSummary,
  sellerStatusLabel,
  orderStatusLabel,
  paymentStatusLabel,
  paymentMethodLabel,
  postStatusLabel,
  complaintStatusLabel,
  localizeNotificationText,
};

export function formatPrice(n: number | string) {
  return `${Number(n).toLocaleString('vi-VN')}₫`;
}

const FOOD_IMAGES = [
  '/assets/food-teriyaki.svg',
  '/assets/food-noodle.svg',
  '/assets/food-banhmi.svg',
  '/assets/food-rice.svg',
  '/assets/drink-tea.svg',
];

const LAUNDRY_IMAGES = [
  '/assets/laundry-basket.svg',
  '/assets/laundry-shirt.svg',
  '/assets/laundry-shoes.svg',
  '/assets/laundry-bed.svg',
];

export function getFoodImage(index: number) {
  return FOOD_IMAGES[index % FOOD_IMAGES.length];
}

export function getLaundryImage(index: number) {
  return LAUNDRY_IMAGES[index % LAUNDRY_IMAGES.length];
}

export function formatRating(avg?: number | null, count?: number | null) {
  const c = Number(count ?? 0);
  if (!c) return { text: 'Mới', stars: '—' };
  const a = Number(avg ?? 0);
  return { text: a.toFixed(1), stars: '★' };
}

export function laundryUnitLabel(unit?: string | null) {
  if (unit === 'kg') return 'kg';
  if (unit === 'item') return 'món';
  if (unit === 'load') return 'tải';
  return unit ?? '';
}

type OrderTitleInput = {
  summary?: string;
  orderCode: string;
  type: string;
  items?: { itemName: string; quantity: number }[];
  laundry?: { serviceName: string; estimatedQty?: string | null; estimatedUnit?: string | null } | null;
  shipProxy?: { trackingCode?: string | null; pickupLocation?: string | null } | null;
};

export function orderDisplayTitle(order: OrderTitleInput): string {
  const summary = order.summary?.trim();
  if (summary) return summary;
  if (order.type === 'ship_proxy') {
    return formatOrderSummary('ship_proxy', [], null, order.shipProxy);
  }
  if (order.type === 'laundry' && order.laundry?.serviceName) {
    return formatOrderSummary('laundry', [], order.laundry);
  }
  if (order.items?.length) {
    return formatOrderSummary('food', order.items, null);
  }
  if (order.type === 'laundry') return 'Dịch vụ giặt';
  if (order.type === 'ship_proxy') return 'Nhận đồ ship hộ';
  return 'Món ăn';
}

export function deliveryEta(prepMinutes: number) {
  const min = prepMinutes + 10;
  const max = prepMinutes + 25;
  return `${min}-${max} phút`;
}
