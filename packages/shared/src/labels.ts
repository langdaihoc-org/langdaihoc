export const SERVICE_TYPE_LABELS = {
  food: 'Ăn uống',
  laundry: 'Giặt đồ',
  ship_proxy: 'Nhận đồ ship hộ',
} as const;

export const ORDER_TYPE_LABELS = {
  food: 'Ăn uống',
  laundry: 'Giặt',
  ship_proxy: 'Nhận đồ ship hộ',
} as const;

export function serviceTypeLabel(type: string): string {
  return SERVICE_TYPE_LABELS[type as keyof typeof SERVICE_TYPE_LABELS] ?? type;
}

export function orderTypeLabel(type: string): string {
  return ORDER_TYPE_LABELS[type as keyof typeof ORDER_TYPE_LABELS] ?? type;
}

const SELLER_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đang hoạt động',
  rejected: 'Bị từ chối',
  suspended: 'Tạm khóa',
};

export function sellerStatusLabel(status: string): string {
  return SELLER_STATUS_LABELS[status] ?? status;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  accepted: 'Đã nhận',
  preparing: 'Đang chuẩn bị',
  delivering: 'Đang giao',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  rejected: 'Từ chối',
  picking_up: 'Đến lấy đồ',
  picked_up: 'Đã lấy đồ',
  waiting_price_confirmation: 'Chờ xác nhận giá',
  washing: 'Đang giặt',
  returning: 'Giao lại',
  needs_support: 'Cần hỗ trợ',
};

/** Nhãn riêng cho đơn nhận hộ — theo dõi: đang nhận hàng → đã nhận → đang giao → hoàn tất */
const SHIP_PROXY_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  accepted: 'Đã nhận đơn',
  preparing: 'Đang nhận hàng',
  picked_up: 'Đã nhận',
  delivering: 'Đang giao',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  rejected: 'Từ chối',
};

export function orderStatusLabel(status: string, orderType?: string): string {
  if (orderType === 'ship_proxy') {
    return SHIP_PROXY_STATUS_LABELS[status] ?? ORDER_STATUS_LABELS[status] ?? status;
  }
  return ORDER_STATUS_LABELS[status] ?? status;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Chưa thanh toán',
  pending: 'Chờ thanh toán',
  proof_uploaded: 'Đã gửi biên lai',
  verified: 'Đã xác nhận TT',
  paid: 'Đã thanh toán',
  rejected: 'Biên lai bị từ chối',
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Thanh toán cho shipper',
  bank_transfer: 'Chuyển khoản',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const POST_STATUS_LABELS: Record<string, string> = {
  published: 'Đã đăng',
  hidden: 'Ẩn',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
};

export function postStatusLabel(status: string): string {
  return POST_STATUS_LABELS[status] ?? status;
}

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  waiting_seller: 'Chờ seller',
  waiting_buyer: 'Chờ buyer',
  waiting_admin: 'Chờ admin',
  resolved: 'Đã xử lý',
  rejected: 'Từ chối',
  closed: 'Đã đóng',
};

export function complaintStatusLabel(status: string): string {
  return COMPLAINT_STATUS_LABELS[status] ?? status;
}

/** Đổi status code tiếng Anh trong nội dung thông báo cũ sang tiếng Việt. */
export function localizeNotificationText(text: string): string {
  let out = text;
  for (const [code, label] of Object.entries(ORDER_STATUS_LABELS)) {
    out = out.replaceAll(code, label);
  }
  return out;
}
