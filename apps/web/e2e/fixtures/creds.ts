/**
 * Tài khoản test — đọc từ env, fallback về demo seed (chỉ dùng local).
 * KHÔNG dùng các giá trị mặc định này cho môi trường thật.
 */
export const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';
export const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo1234';

export const EMAILS = {
  buyer: process.env.E2E_BUYER_EMAIL ?? 'buyer@hcmut.edu.vn',
  /**
   * "Người dùng khác" khi test IDOR giỏ hàng — dùng seller ship hộ (không đụng cart ở test khác).
   * DEMO_MODE cho phép mọi user đã đăng nhập gọi API cart, nên vẫn kiểm tra được ownership.
   */
  otherUser: process.env.E2E_OTHER_EMAIL ?? 'ship.seller4@demo.local',
  /** Seller sở hữu "Cơm Sinh Viên" (food). */
  sellerBoth: process.env.E2E_SELLER_EMAIL ?? 'seller@demo.local',
  /** Seller food khác — không sở hữu đơn của sellerBoth. */
  sellerFood2: process.env.E2E_SELLER2_EMAIL ?? 'food.seller2@demo.local',
  sellerLaundry3: process.env.E2E_SELLER3_EMAIL ?? 'laundry.seller3@demo.local',
  admin: process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.local',
} as const;
