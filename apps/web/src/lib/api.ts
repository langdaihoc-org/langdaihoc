const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data?.error?.message ?? 'Đã xảy ra lỗi',
      res.status,
      data?.error?.code,
      data?.error?.details,
    );
  }
  return data as T;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers,
    },
  });
  return parseResponse<T>(res);
}

export const authApi = {
  registerBuyer: (body: unknown) =>
    api<{ message: string; redirectTo: string }>('/api/auth/register/buyer', { method: 'POST', body: JSON.stringify(body) }),
  registerSeller: (body: unknown) =>
    api<{ message: string; redirectTo: string }>('/api/auth/register/seller', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: unknown) =>
    api<{ user: AuthUser; redirectTo: string; requiresEmailVerification: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => api<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  me: () => api<{ user: AuthUser & { shopName?: string | null } }>('/api/auth/me'),
  updateProfile: (body: { fullName?: string; phone?: string | null; avatarUrl?: string | null }) =>
    api<{ data: unknown; user: AuthUser; message: string }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  forgotPassword: (body: unknown) =>
    api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body: unknown) =>
    api<{ message: string; redirectTo: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (body: unknown) =>
    api<{ message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  resendVerification: (identifier: string) =>
    api<{ message: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),
};

export const catalogApi = {
  home: () =>
    api<{
      data: {
        food: FoodItem[];
        sellers: Seller[];
        laundry: LaundryService[];
        categories: Category[];
        banners: Banner[];
        popupBanners: Banner[];
      };
    }>('/api/catalog/home'),
  banners: (opts?: { popup?: boolean }) => {
    const q =
      opts?.popup === true ? '?popup=1' : opts?.popup === false ? '?popup=0' : '';
    return api<{ data: Banner[] }>(`/api/catalog/banners${q}`);
  },
  posts: (limit?: number) =>
    api<{ data: FeedPost[] }>(`/api/catalog/posts${limit ? `?limit=${limit}` : ''}`),
  post: (id: string) => api<{ data: FeedPost }>(`/api/catalog/posts/${id}`),
  sellers: (serviceType?: 'food' | 'laundry' | 'ship_proxy') =>
    api<{ data: Seller[] }>(`/api/catalog/sellers${serviceType ? `?serviceType=${serviceType}` : ''}`),
  sellerReviews: (sellerId: string) => api<{ data: Review[] }>(`/api/catalog/sellers/${sellerId}/reviews`),
  food: (params?: string) =>
    api<{ data: FoodItem[]; meta?: { page: number; limit: number; total: number } }>(
      `/api/catalog/food${params ? `?${params}` : ''}`,
    ),
  laundry: (params?: string) => api<{ data: LaundryService[] }>(`/api/catalog/laundry${params ? `?${params}` : ''}`),
  categories: (type?: string) => api<{ data: Category[] }>(`/api/catalog/categories${type ? `?type=${type}` : ''}`),
};

export const cartApi = {
  get: () => api<{ data: CartData }>('/api/cart'),
  add: (body: unknown) => api<{ data: CartData }>('/api/cart/items', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, quantity: number) =>
    api<{ data: CartData }>(`/api/cart/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
  remove: (id: string) => api<{ data: CartData }>(`/api/cart/items/${id}`, { method: 'DELETE' }),
  clear: () => api('/api/cart', { method: 'DELETE' }),
};

export const ordersApi = {
  list: (page = 1, limit = 20) =>
    api<{ data: Order[]; meta: { page: number; limit: number; hasMore: boolean } }>(
      `/api/orders?page=${page}&limit=${limit}`,
    ),
  pulse: () =>
    api<{
      data: {
        pendingCount: number;
        openCount: number;
        latestCreatedAt: string | null;
        latestUpdatedAt: string | null;
        unreadNotifications?: number;
        latestNotificationAt?: string | null;
      };
    }>('/api/orders/pulse'),
  get: (id: string) => api<{ data: OrderDetailResponse }>(`/api/orders/${id}`),
  checkoutFood: (body: unknown, idempotencyKey?: string) =>
    api<{ data: Order }>('/api/orders/food/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
  createLaundry: (body: unknown, idempotencyKey?: string) =>
    api<{ data: Order }>('/api/orders/laundry', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
  createShipProxy: (body: unknown, idempotencyKey?: string) =>
    api<{ data: Order }>('/api/orders/ship-proxy', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
  updateStatus: (id: string, status: string, note?: string) =>
    api(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
  confirmPrice: (id: string) => api(`/api/orders/${id}/confirm-price`, { method: 'POST' }),
  rejectPrice: (id: string) => api(`/api/orders/${id}/reject-price`, { method: 'POST' }),
  submitQuote: (id: string, body: unknown) =>
    api(`/api/orders/${id}/laundry-quote`, { method: 'POST', body: JSON.stringify(body) }),
  review: (id: string, body: unknown) =>
    api(`/api/orders/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
  updateReview: (id: string, body: unknown) =>
    api(`/api/orders/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  complaint: (id: string, body: unknown) =>
    api<{ data: Complaint }>(`/api/orders/${id}/complaint`, { method: 'POST', body: JSON.stringify(body) }),
  escalateComplaint: (id: string) =>
    api<{ data: Complaint; message: string }>(`/api/orders/${id}/complaint/escalate`, {
      method: 'POST',
      body: '{}',
    }),
  complaintMessage: (orderId: string, body: string) =>
    api<{ data: ComplaintMessage }>(`/api/orders/${orderId}/complaint/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  paymentProof: (id: string, imageUrl: string) =>
    api(`/api/orders/${id}/payment-proof`, { method: 'POST', body: JSON.stringify({ imageUrl }) }),
  verifyPayment: (id: string, approved: boolean, rejectionReason?: string) =>
    api(`/api/orders/${id}/verify-payment`, { method: 'POST', body: JSON.stringify({ approved, rejectionReason }) }),
  markPaid: (id: string) => api(`/api/orders/${id}/mark-paid`, { method: 'POST' }),
  bankInfo: (sellerId: string) => api<{ data: BankAccount | null }>(`/api/orders/bank-info/${sellerId}`),
};

export const buyerApi = {
  addresses: () => api<{ data: Address[] }>('/api/buyer/addresses'),
  addAddress: (body: unknown) =>
    api<{ data: Address }>('/api/buyer/addresses', { method: 'POST', body: JSON.stringify(body) }),
  updateAddress: (id: string, body: unknown) =>
    api<{ data: Address }>(`/api/buyer/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAddress: (id: string) => api(`/api/buyer/addresses/${id}`, { method: 'DELETE' }),
  uploadImage: (body: {
    bucket: 'payment-proofs';
    contentType: string;
    dataBase64: string;
    fileName?: string;
    orderId: string;
  }) =>
    api<{ data: { url: string } }>('/api/buyer/upload', { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (body: { fullName?: string; phone?: string | null; email?: string }) =>
    api<{ data: unknown; emailChanged?: boolean; message?: string }>('/api/buyer/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  notifications: () => api<{ data: Notification[] }>('/api/buyer/notifications'),
  markNotificationRead: (id: string) =>
    api(`/api/buyer/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    api('/api/buyer/notifications/read-all', { method: 'PATCH' }),
};

export const sellerApi = {
  shop: () => api<{ data: SellerShop }>('/api/seller/shop'),
  updateShop: (body: {
    shopName?: string;
    description?: string;
    businessAddress?: string;
    avatarUrl?: string;
    phone?: string | null;
    openHours?: string | null;
    serviceAreas?: string[];
    avgDeliveryMinutes?: number | null;
    acceptingOrders?: boolean;
    shipProxyFee?: number | null;
  }) =>
    api<{ data: SellerShop }>('/api/seller/shop', { method: 'PATCH', body: JSON.stringify(body) }),
  foodItems: () => api<{ data: SellerFoodItem[] }>('/api/seller/food-items'),
  addFood: (body: unknown) =>
    api<{ data: SellerFoodItem }>('/api/seller/food-items', { method: 'POST', body: JSON.stringify(body) }),
  updateFood: (id: string, body: unknown) =>
    api<{ data: SellerFoodItem }>(`/api/seller/food-items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFood: (id: string) =>
    api<{ data: { id: string } }>(`/api/seller/food-items/${id}`, { method: 'DELETE' }),
  laundryServices: () => api<{ data: SellerLaundryItem[] }>('/api/seller/laundry-services'),
  addLaundry: (body: unknown) =>
    api<{ data: SellerLaundryItem }>('/api/seller/laundry-services', { method: 'POST', body: JSON.stringify(body) }),
  updateLaundry: (id: string, body: unknown) =>
    api<{ data: SellerLaundryItem }>(`/api/seller/laundry-services/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLaundry: (id: string) =>
    api<{ data: { id: string } }>(`/api/seller/laundry-services/${id}`, { method: 'DELETE' }),
  bankAccounts: () => api<{ data: BankAccount[] }>('/api/seller/bank-accounts'),
  addBankAccount: (body: unknown) =>
    api<{ data: BankAccount }>('/api/seller/bank-accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateBankAccount: (id: string, body: { isDefault?: boolean; isActive?: boolean }) =>
    api<{ data: BankAccount }>(`/api/seller/bank-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBankAccount: (id: string) =>
    api<{ data: { id: string } }>(`/api/seller/bank-accounts/${id}`, { method: 'DELETE' }),
  uploadImage: (body: { bucket: 'food-images' | 'laundry-images' | 'post-images'; contentType: string; dataBase64: string; fileName?: string }) =>
    api<{ data: { url: string } }>('/api/seller/upload', { method: 'POST', body: JSON.stringify(body) }),
  posts: () => api<{ data: SellerPost[] }>('/api/seller/posts'),
  addPost: (body: unknown) => api<{ data: SellerPost }>('/api/seller/posts', { method: 'POST', body: JSON.stringify(body) }),
  updatePost: (id: string, body: unknown) =>
    api<{ data: SellerPost }>(`/api/seller/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePost: (id: string) => api<{ data: { id: string } }>(`/api/seller/posts/${id}`, { method: 'DELETE' }),
  complaints: () => api<{ data: Complaint[] }>('/api/seller/complaints'),
  complaintMessages: (id: string) =>
    api<{ data: ComplaintMessage[] }>(`/api/seller/complaints/${id}/messages`),
  addComplaintMessage: (id: string, body: string) =>
    api<{ data: ComplaintMessage }>(`/api/seller/complaints/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};

export const adminApi = {
  stats: () =>
    api<{ data: { buyers: number; sellers: number; orders: number; pendingSellers: number; openComplaints: number; processingOrders: number } }>('/api/admin/stats'),
  sellers: () => api<{ data: AdminSellerRow[] }>('/api/admin/sellers'),
  approveSeller: (
    id: string,
    status?: string,
    rejectionReason?: string,
    serviceTypes?: 'food' | 'laundry' | 'ship_proxy',
    extra?: { shopName?: string; businessAddress?: string },
  ) =>
    api(`/api/admin/sellers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason, serviceTypes, ...extra }),
    }),
  updateSeller: (
    id: string,
    body: { status?: string; shopName?: string; businessAddress?: string; rejectionReason?: string; serviceTypes?: 'food' | 'laundry' | 'ship_proxy' },
  ) =>
    api(`/api/admin/sellers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSeller: (id: string) =>
    api<{ data: { id: string; deleted: boolean } }>(`/api/admin/sellers/${id}`, { method: 'DELETE' }),
  createShipSeller: (body: unknown) =>
    api<{ data: SellerShop }>('/api/admin/ship-sellers', { method: 'POST', body: JSON.stringify(body) }),
  users: (params?: { role?: string; status?: string; q?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.role) sp.set('role', params.role);
    if (params?.status) sp.set('status', params.status);
    if (params?.q) sp.set('q', params.q);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return api<{ data: AdminUser[] }>(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },
  updateUser: (id: string, body: { status: 'active' | 'suspended' }) =>
    api<{ data: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id: string) =>
    api<{ data: { id: string; deleted: boolean } }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  categories: (type?: 'food' | 'laundry') =>
    api<{ data: AdminCategory[] }>(`/api/admin/categories${type ? `?type=${type}` : ''}`),
  addCategory: (body: { name: string; slug?: string; type: 'food' | 'laundry'; sortOrder?: number; isActive?: boolean }) =>
    api<{ data: AdminCategory }>('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id: string, body: Partial<{ name: string; slug: string; type: 'food' | 'laundry'; sortOrder: number; isActive: boolean }>) =>
    api<{ data: AdminCategory }>(`/api/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id: string) =>
    api<{ data: { id: string; deleted: boolean } }>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  auditLogs: (limit?: number) =>
    api<{ data: AuditLog[] }>(`/api/admin/audit-logs${limit ? `?limit=${limit}` : ''}`),
  orders: () => api<{ data: Order[] }>('/api/admin/orders'),
  complaints: () => api<{ data: Complaint[] }>('/api/admin/complaints'),
  updateComplaint: (id: string, body: { status: string; adminResolution?: string }) =>
    api<{ data: Complaint }>(`/api/admin/complaints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  complaintMessages: (id: string) =>
    api<{ data: ComplaintMessage[] }>(`/api/admin/complaints/${id}/messages`),
  addComplaintMessage: (id: string, body: string) =>
    api<{ data: ComplaintMessage }>(`/api/admin/complaints/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  uploadImage: (body: {
    bucket: 'post-images' | 'banner-images';
    contentType: string;
    dataBase64: string;
    fileName?: string;
  }) => api<{ data: { url: string } }>('/api/admin/upload', { method: 'POST', body: JSON.stringify(body) }),
  banners: () => api<{ data: Banner[] }>('/api/admin/banners'),
  addBanner: (body: unknown) => api<{ data: Banner }>('/api/admin/banners', { method: 'POST', body: JSON.stringify(body) }),
  updateBanner: (id: string, body: unknown) =>
    api<{ data: Banner }>(`/api/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBanner: (id: string) => api<{ data: { id: string } }>(`/api/admin/banners/${id}`, { method: 'DELETE' }),
  posts: (status?: string) =>
    api<{ data: AdminPost[] }>(`/api/admin/posts${status ? `?status=${status}` : ''}`),
  addPost: (body: unknown) => api<{ data: AdminPost }>('/api/admin/posts', { method: 'POST', body: JSON.stringify(body) }),
  updatePost: (id: string, body: unknown) =>
    api<{ data: AdminPost }>(`/api/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePost: (id: string) => api<{ data: { id: string } }>(`/api/admin/posts/${id}`, { method: 'DELETE' }),
};

export interface AuthUser {
  id: string; email: string; phone?: string | null; role: string;
  status: string; fullName: string;
  avatarUrl?: string | null;
  emailVerified: boolean; sellerStatus: string | null;
  shopName?: string | null;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  ctaLabel?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isPopup?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface FeedPost {
  id: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  ctaLabel?: string | null;
  linkUrl?: string | null;
  foodItemId?: string | null;
  isPinned: boolean;
  publishedAt?: string | null;
  createdAt: string;
  sellerId?: string | null;
  shopName?: string | null;
  avatarUrl?: string | null;
  serviceTypes?: 'food' | 'laundry' | 'ship_proxy' | null;
}

export interface SellerPost {
  id: string;
  sellerId: string | null;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  ctaLabel?: string | null;
  linkUrl?: string | null;
  foodItemId?: string | null;
  status: 'published' | 'hidden' | 'pending' | 'rejected';
  isPinned: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

export interface AdminPost extends SellerPost {
  shopName?: string | null;
}

export interface Category {
  id: string; name: string; slug: string; type: 'food' | 'laundry';
}

export interface Seller {
  id: string; shopName: string; serviceTypes: 'food' | 'laundry' | 'ship_proxy';
  businessAddress?: string | null; description?: string | null; avatarUrl?: string | null;
  phone?: string | null;
  openHours?: string | null;
  serviceAreas?: string[] | null;
  avgDeliveryMinutes?: number | null;
  shipProxyFee?: string | number | null;
  rating: { average: number; count: number };
}

export interface FoodOption {
  id: string; name: string; priceDelta: number; groupId?: string | null;
}

export interface FoodOptionGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number;
  options: FoodOption[];
}

export interface FoodItem {
  id: string; name: string; description?: string; price: number; prepTimeMinutes: number;
  shopName: string; sellerId: string; categoryId?: string | null; imageUrl?: string | null;
  imageUrls?: string[];
  options?: FoodOption[];
  optionGroups?: FoodOptionGroup[];
}

export interface LaundryService {
  id: string; name: string; description?: string; basePrice: number; unit: string;
  estimatedTimeHours: number; shopName: string; sellerId: string; serviceAreas?: string[]; imageUrl?: string | null;
  shopPhone?: string | null;
  shopAddress?: string | null;
  shopOpenHours?: string | null;
}

export interface CartData {
  items: {
    id: string;
    foodItemId: string;
    name: string;
    price: number;
    quantity: number;
    lineTotal: number;
    note?: string | null;
    optionsJson?: { id: string; name: string; priceDelta: number }[] | null;
  }[];
  subtotal: number; shopName: string | null; sellerId: string | null;
}

export interface Order {
  id: string; orderCode: string; type: string; status: string; total: string; subtotal?: string;
  paymentMethod: string; paymentStatus: string; createdAt: string; sellerId?: string;
  notes?: string | null; pickupScheduledAt?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: Address | null;
  pickupAddress?: Address | null; returnAddress?: Address | null;
  summary?: string;
  buyerName?: string;
  items?: {
    itemName: string;
    quantity: number;
    lineTotal: string;
    note?: string | null;
    options?: { name: string; priceDelta?: number }[];
  }[];
  laundry?: LaundryOrderDetail | null;
  shipProxy?: ShipProxyOrderDetail | null;
  desiredDeliveryAt?: string | null;
  recipientName?: string | null;
  proofs?: PaymentProof[];
}

export interface LaundryOrderDetail {
  serviceName: string;
  estimatedQty?: string | null;
  estimatedUnit?: string | null;
  actualQty?: string | null;
  unitPrice?: string | null;
  surcharge?: string | null;
  finalPrice?: string | null;
  sellerNote?: string | null;
  buyerPriceConfirmedAt?: string | null;
  priceRejectedAt?: string | null;
}

export interface ShipProxyOrderDetail {
  trackingCode: string;
  pickupLocation: string;
  pickupAt: string;
  receivePhone: string;
  returnAt: string;
  returnAddressText: string;
  contactPhone: string;
  /** Giá tiền hàng cần nhận hộ (khách khai) */
  packageValue?: string | number | null;
}

export interface PaymentProof {
  id: string; imageUrl: string; status: string; rejectionReason?: string | null;
}

export interface OrderDetailResponse {
  order: Order;
  items: {
    itemName: string;
    quantity: number;
    lineTotal: string;
    note?: string | null;
    options?: { name: string; priceDelta?: number }[];
  }[];
  laundry: LaundryOrderDetail | null;
  shipProxy?: ShipProxyOrderDetail | null;
  sellerContact?: { shopName: string; phone?: string | null; fullName?: string | null } | null;
  history: { toStatus: string; createdAt: string }[];
  proofs: PaymentProof[];
  review?: OrderReview | null;
  complaint?: Complaint | null;
  complaintMessages?: ComplaintMessage[];
}

export interface OrderReview {
  id: string; rating: number; comment?: string | null; tags?: string[] | null; createdAt: string;
}

export interface ComplaintMessage {
  id: string; body: string; authorRole: string; authorName: string; createdAt: string;
}

export interface Address {
  id: string; recipientName: string; phone: string; detail: string;
  dormName?: string; roomNumber?: string; isDefault?: boolean; addressType?: string;
}

export interface Notification {
  id: string; type: string; title: string; body: string; readAt?: string | null; createdAt: string;
  data?: { orderId?: string };
}

export interface BankAccount {
  id: string; bankName: string; accountNumber: string; accountHolder: string;
  qrImageUrl?: string | null; isDefault: boolean;
}

export interface Review {
  id: string; rating: number; comment?: string | null; buyerName: string; createdAt: string;
  tags?: string[] | null;
}

export interface Complaint {
  id: string; orderId: string; reason: string; description: string; status: string;
  adminResolution?: string | null; createdAt: string; evidenceUrls?: string[] | null;
  shopName?: string | null;
  buyer?: { id: string; fullName: string; email: string; phone?: string | null } | null;
}

export interface SellerShop {
  id: string; shopName: string; description?: string | null; businessAddress?: string | null; status: string;
  serviceTypes: 'food' | 'laundry' | 'ship_proxy'; avatarUrl?: string | null; rejectionReason?: string | null;
  phone?: string | null;
  openHours?: string | null;
  serviceAreas?: string[] | null; avgDeliveryMinutes?: number | null;
  acceptingOrders?: boolean;
  shipProxyFee?: string | number | null;
}

export interface SellerFoodItem {
  id: string; name: string; description?: string | null; price: string; isAvailable: boolean;
  prepTimeMinutes: number; imageUrl?: string | null; imageUrls?: string[] | null;
  categoryId?: string | null; categoryIds?: string[] | null;
  optionGroups?: FoodOptionGroup[];
  options?: FoodOption[];
}

export interface SellerLaundryItem {
  id: string; name: string; description?: string | null; basePrice: string; unit: string;
  estimatedTimeHours: number; isAvailable: boolean; imageUrl?: string | null; serviceAreas?: string[] | null;
}

export interface AdminSellerRow {
  seller: {
    id: string;
    shopName: string;
    status: string;
    serviceTypes: 'food' | 'laundry' | 'ship_proxy';
    businessAddress?: string | null;
    description?: string | null;
    rejectionReason?: string | null;
  };
  email: string; fullName: string; phone?: string | null;
}

export interface AdminUser {
  id: string; email: string; fullName: string; role: string; status: string;
  phone?: string | null; createdAt: string;
}

export interface AdminCategory {
  id: string; name: string; slug: string; type: 'food' | 'laundry';
  sortOrder: number; isActive: boolean; createdAt?: string;
}

export interface AuditLog {
  id: string; action: string; entityType: string; entityId?: string | null;
  actorRole?: string | null; actorName?: string | null; createdAt: string;
}
