import type { FoodOrderStatus, LaundryOrderStatus, ShipProxyOrderStatus } from './enums.js';

const FOOD_TRANSITIONS: Record<FoodOrderStatus, FoodOrderStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

const SHIP_TRANSITIONS: Record<ShipProxyOrderStatus, ShipProxyOrderStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['picked_up', 'cancelled'],
  picked_up: ['delivering'],
  delivering: ['completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

const LAUNDRY_TRANSITIONS: Record<LaundryOrderStatus, LaundryOrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['picking_up', 'cancelled'],
  picking_up: ['picked_up'],
  picked_up: ['waiting_price_confirmation'],
  waiting_price_confirmation: ['washing', 'cancelled', 'needs_support'],
  washing: ['returning'],
  returning: ['completed'],
  completed: [],
  cancelled: [],
  needs_support: ['washing', 'cancelled'],
};

export function canTransitionFood(from: FoodOrderStatus, to: FoodOrderStatus): boolean {
  return FOOD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionShipProxy(from: ShipProxyOrderStatus, to: ShipProxyOrderStatus): boolean {
  return SHIP_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionLaundry(
  from: LaundryOrderStatus,
  to: LaundryOrderStatus,
): boolean {
  return LAUNDRY_TRANSITIONS[from]?.includes(to) ?? false;
}

export type OrderActor = 'buyer' | 'seller' | 'admin';

/**
 * Ai được phép thực hiện mỗi bước chuyển. State machine chỉ nói bước nào hợp lệ,
 * bảng này nói bên nào được bấm — tránh buyer tự nhận đơn thay quán.
 */
const FOOD_ACTORS: Record<string, OrderActor[]> = {
  'pending>accepted': ['seller', 'admin'],
  'pending>rejected': ['seller', 'admin'],
  'pending>cancelled': ['buyer', 'seller', 'admin'],
  'accepted>preparing': ['seller', 'admin'],
  // Sau khi quán xác nhận: buyer không được hủy — chỉ seller/admin xử lý đặc biệt
  'accepted>cancelled': ['seller', 'admin'],
  'preparing>delivering': ['seller', 'admin'],
  'preparing>cancelled': ['seller', 'admin'],
  'delivering>completed': ['buyer', 'seller', 'admin'],
};

const SHIP_ACTORS: Record<string, OrderActor[]> = {
  'pending>accepted': ['seller', 'admin'],
  'pending>rejected': ['seller', 'admin'],
  'pending>cancelled': ['buyer', 'seller', 'admin'],
  'accepted>preparing': ['seller', 'admin'],
  'accepted>cancelled': ['seller', 'admin'],
  'preparing>picked_up': ['seller', 'admin'],
  'preparing>cancelled': ['seller', 'admin'],
  'picked_up>delivering': ['seller', 'admin'],
  'delivering>completed': ['buyer', 'seller', 'admin'],
};

const LAUNDRY_ACTORS: Record<string, OrderActor[]> = {
  'pending>accepted': ['seller', 'admin'],
  'pending>cancelled': ['buyer', 'seller', 'admin'],
  'accepted>picking_up': ['seller', 'admin'],
  'accepted>cancelled': ['seller', 'admin'],
  'picking_up>picked_up': ['seller', 'admin'],
  'picked_up>waiting_price_confirmation': ['seller', 'admin'],
  // seller: khi shop bật autoConfirmLaundryQuote (laundry-quote tự chuyển tiếp)
  'waiting_price_confirmation>washing': ['buyer', 'seller', 'admin'],
  'waiting_price_confirmation>cancelled': ['buyer', 'admin'],
  'waiting_price_confirmation>needs_support': ['buyer', 'seller', 'admin'],
  'washing>returning': ['seller', 'admin'],
  'returning>completed': ['buyer', 'seller', 'admin'],
  'needs_support>washing': ['admin'],
  'needs_support>cancelled': ['buyer', 'admin'],
};

export function canActorTransition(
  orderType: 'food' | 'laundry' | 'ship_proxy',
  from: string,
  to: string,
  actor: string,
): boolean {
  let valid = false;
  let table: Record<string, OrderActor[]> = FOOD_ACTORS;
  if (orderType === 'laundry') {
    valid = canTransitionLaundry(from as LaundryOrderStatus, to as LaundryOrderStatus);
    table = LAUNDRY_ACTORS;
  } else if (orderType === 'ship_proxy') {
    valid = canTransitionShipProxy(from as ShipProxyOrderStatus, to as ShipProxyOrderStatus);
    table = SHIP_ACTORS;
  } else {
    valid = canTransitionFood(from as FoodOrderStatus, to as FoodOrderStatus);
    table = FOOD_ACTORS;
  }
  if (!valid) return false;
  return table[`${from}>${to}`]?.includes(actor as OrderActor) ?? false;
}

export function extractEmailDomain(email: string): string {
  const parts = email.toLowerCase().trim().split('@');
  return parts[1] ?? '';
}
