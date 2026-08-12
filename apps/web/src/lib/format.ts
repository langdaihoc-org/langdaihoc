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

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Giờ + ngày VN, không giây — vd. 11:30 · 12/08/2026 */
export function formatDateTimeVi(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Cửa sổ giao mong muốn.
 * Có until → "11:30 – 12:00 · 12/08/2026"; không thì một mốc giờ.
 */
export function formatDeliveryWish(
  from: string | Date | null | undefined,
  until?: string | Date | null,
): string {
  if (!from) return '';
  const start = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return '';
  const datePart = `${pad2(start.getDate())}/${pad2(start.getMonth() + 1)}/${start.getFullYear()}`;
  const fromT = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  if (until) {
    const end = typeof until === 'string' ? new Date(until) : until;
    if (!Number.isNaN(end.getTime())) {
      const toT = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      return `${fromT} – ${toT} · ${datePart}`;
    }
  }
  return `${fromT} · ${datePart}`;
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
