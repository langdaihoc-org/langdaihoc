export const USER_ROLES = ['buyer', 'seller', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = [
  'pending_email_verification',
  'active',
  'suspended',
  'deleted',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SELLER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const ORDER_TYPES = ['food', 'laundry', 'ship_proxy'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const FOOD_ORDER_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'delivering',
  'completed',
  'cancelled',
  'rejected',
] as const;
export type FoodOrderStatus = (typeof FOOD_ORDER_STATUSES)[number];

/** Ship hộ: nhận hàng → đã nhận → giao lại → hoàn tất */
export const SHIP_PROXY_ORDER_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'picked_up',
  'delivering',
  'completed',
  'cancelled',
  'rejected',
] as const;
export type ShipProxyOrderStatus = (typeof SHIP_PROXY_ORDER_STATUSES)[number];

export const LAUNDRY_ORDER_STATUSES = [
  'pending',
  'accepted',
  'picking_up',
  'picked_up',
  'waiting_price_confirmation',
  'washing',
  'returning',
  'completed',
  'cancelled',
  'needs_support',
] as const;
export type LaundryOrderStatus = (typeof LAUNDRY_ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'proof_uploaded',
  'verified',
  'rejected',
  'paid',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SERVICE_TYPES = ['food', 'laundry', 'ship_proxy'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
