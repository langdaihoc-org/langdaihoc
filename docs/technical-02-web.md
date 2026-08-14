# 02 — Web (frontend)

> Quay lại [mục lục](./technical-overview.md) · Trước: [01](./technical-01-overview.md) · Sau: [03](./technical-03-api.md)

Nguồn: `apps/web/src`. Route khai báo lazy trong `app.tsx`.

## 2.1. Build & cấu hình

| Mục | Chi tiết |
|-----|----------|
| Dev | `pnpm dev:web` → Vite `:5173` |
| Build | `tsc -b && vite build` → `apps/web/dist` |
| Vercel | Root `vercel.json`: build `pnpm --filter @langdaihoc/web build`, output `apps/web/dist`, install **`--prod=false`** (cần tsc/vite) |
| Env bắt buộc prod | `VITE_API_URL` = URL API (bake vào JS) |

Mọi deep-link (`/orders/…`) trả `index.html` (SPA rewrite).

## 2.2. Auth phía client

File: `contexts/auth-context.tsx`.

| Field / method | Ý nghĩa |
|----------------|----------|
| `user` | `AuthUser` từ `/api/auth/me` |
| `isLoading` | Đang hydrate |
| `isAuthenticated` | Có user |
| `isActiveBuyer` | buyer + active + emailVerified — điều kiện checkout/laundry/ship |
| `setSessionUser` | Sau login/OAuth |
| `logout` | Xóa cache PII local rồi gọi API logout |

Guards (`components/layout/buyer-layout.tsx`):

| Guard | Hành vi |
|-------|---------|
| `BuyerOnlyLayout` | Seller/admin bị đẩy về home role của họ |
| `ProtectedRoute roles={…}` | Chưa login → login; sai role → home role |
| `GuestOnlyRoute` | Đã login → không vào trang login/register |

Role home: `lib/roles.ts` (`ROLE_HOME`, `canAccessPath`).

## 2.3. Bảng route đầy đủ

### Buyer / guest

| Path | File trang | Guard |
|------|------------|-------|
| `/` | `pages/home-page.tsx` | BuyerOnlyLayout |
| `/explore` | `pages/buyer/explore-page.tsx` | BuyerOnlyLayout |
| `/p/:postId` | `pages/buyer/post-detail-page.tsx` | BuyerOnlyLayout |
| `/food` | `pages/buyer/food-page.tsx` | BuyerOnlyLayout |
| `/store/:sellerId` | `pages/buyer/store-page.tsx` | BuyerOnlyLayout |
| `/laundry` | `pages/buyer/laundry-page.tsx` | BuyerOnlyLayout |
| `/laundry/book/:serviceId` | `pages/buyer/laundry-book-page.tsx` | buyer |
| `/ship` | `ship-proxy-page` → form | BuyerOnlyLayout |
| `/ship/book/:sellerId` | `ship-proxy-book-page` → form | buyer |
| `/cart` | `cart-page.tsx` | buyer |
| `/checkout` | `checkout-page.tsx` | buyer |
| `/orders` | `orders-list-page.tsx` | buyer |
| `/orders/:id` | `order-detail-page.tsx` | buyer |
| `/profile` | `profile-page.tsx` | buyer |
| `/privacy`, `/terms` | legal pages | BuyerOnlyLayout |

### Auth

| Path | File |
|------|------|
| `/auth/login` | `login-page.tsx` |
| `/auth/oauth/callback` | `oauth-callback-page.tsx` |
| `/auth/check-email`, `/auth/verify-email` | `login-page.tsx` exports |
| `/auth/register/buyer` | `register-buyer-page.tsx` |
| `/auth/register/seller` | `register-seller-page.tsx` |
| `/auth/forgot-password` | `password-pages.tsx` |
| `/auth/reset-password` & `/auth/reset_password` | alias |

### Seller

| Path | Việc |
|------|------|
| `/seller` | Dashboard + bật/tắt `acceptingOrders` |
| `/seller/orders` | Xử lý đơn, quote, verify CK, late warning |
| `/seller/products` | Food hoặc laundry CRUD (theo `serviceTypes`) |
| `/seller/menu`, `/seller/laundry` | Redirect → products |
| `/seller/profile` | Shop + operatingWindows + gap phút + phí ship |
| `/seller/bank` | STK / MoMo / VietQR |
| `/seller/posts` | Bài feed |
| `/seller/reviews` | Xem đánh giá |
| `/seller/complaints` | Khiếu nại (`?c=` deep link) |

Ship seller: nav **ẩn** products (không có SKU).

### Admin

| Path | Việc |
|------|------|
| `/admin` | Stats + seller pending + đơn gần đây |
| `/admin/sellers` | Approve/reject, tạo ship seller, billing month |
| `/admin/users` | Suspend/xóa user |
| `/admin/categories` | Danh mục food/laundry |
| `/admin/audit` | Audit log |
| `/admin/banners` | Banner ngang + popup (`isPopup`) |
| `/admin/posts` | Duyệt/tạo post |
| `/admin/orders` | Toàn bộ đơn |
| `/admin/complaints` | Khiếu nại admin |
| `/admin/feedback` | Feedback footer |
| `/admin/profile` | Hồ sơ admin |

## 2.4. Thư mục `components/`

### layout/
- `responsive-layout.tsx` — chrome buyer (header, bottom nav, sticky cart)
- `dashboard-shell.tsx` — seller/admin (bottom nav `z-[100]`, more menu `z-[110]`)
- `auth-layout.tsx`, `buyer-footer.tsx`, `email-verify-banner.tsx`, `install-app-banner.tsx`, `site-feedback-form.tsx`

### marketplace/
| Component | Vai trò |
|-----------|---------|
| `home-hero`, `banner-carousel` | Hero + banner (loại trừ popup) |
| `promo-popup` | Popup 1 lần/ngày (`localStorage`) |
| `store-card`, `store-with-menu` | Quán + menu |
| `food-item-sheet` | Chọn option + thêm giỏ / mua ngay |
| `sticky-cart-bar` | CTA giỏ (ẩn trên cart/checkout) |
| `laundry-card`, `laundry-shop-with-services` | Duyệt giặt |
| `laundry-quote-card` | UI xác nhận giá |
| `delivery-time-picker` | Hôm nay/mai, bước 10 phút |
| `dated-time-picker` | Nhiều ngày (giặt 14 ngày, ship 30 ngày) |
| `address-picker` | Địa chỉ lưu / nhập tay + dorm handoff tòa/rào |
| `feed-post` | Feed explore |
| `complaint-thread` | Chat khiếu nại |
| `shop-contact-card`, `review-tags`, `wheel-column` | Phụ |

### seller/
- `food-product-manager.tsx` / `laundry-product-manager.tsx` — CRUD modal **`z-[120]`** (trên bottom nav)
- `seller-notification-bell.tsx`

### ui/
- `modal.tsx` — portal, Escape, focus trap, default `z-[80]`; mobile bottom sheet
- `confirm-dialog.tsx` `z-[110]`, `toast.tsx` `z-[100]`
- `order-timeline.tsx`, `image-uploader.tsx`, `notification-panel.tsx`, `safe-nav-link.tsx`, …

## 2.5. `lib/api.ts` — namespaces

Mọi gọi: `credentials: 'include'`, JSON, `X-Requested-With`.

| Namespace | Việc |
|-----------|------|
| `authApi` | register/login/oauth/logout/me/profile/password/verify |
| `catalogApi` | home, banners, posts, sellers, food, laundry, categories, feedback |
| `cartApi` | CRUD giỏ |
| `ordersApi` | list, pulse, get, checkoutFood, createLaundry, createShipProxy, status, quote, confirm/reject price, payment, review, complaint, late warning, bankInfo |
| `buyerApi` | addresses, upload proof, notifications, profile |
| `sellerApi` | shop, items, bank, posts, complaints, notifications, upload |
| `adminApi` | stats, sellers, users, categories, audit, orders, complaints, banners, posts, feedback, billing, upload |

Lỗi: class `ApiError(status, code, message)`.

## 2.6. Lib khác

| File | Việc |
|------|------|
| `operating-hours.ts` | Re-export shared (HH:mm, filter slot) |
| `format.ts` | Giá, ngày giờ VI, label trạng thái, ảnh |
| `dorm-handoff.ts` | Chỉ giao tại **tòa / rào** (không giao tận phòng) |
| `vietqr.ts` | Ngân hàng, logo, QR, memo CK |
| `google-oauth.ts` / `supabase.ts` | OAuth + realtime client lazy |
| `pwa.ts` | Install prompt, dismiss 24h |
| `roles.ts` | Phân quyền path |
| `utils.ts` | `cn()` |

## 2.7. Live updates buyer

`hooks/use-buyer-live.ts`: poll `GET /api/orders/pulse` (10/15/30s tùy trạng thái; dừng khi tab ẩn). Đổi fingerprint → invalidate orders/notifications queries.

## 2.8. Flow buyer chi tiết

### Food

1. `/food` hoặc `/store/:id` → mở `FoodItemSheet` (cần login).
2. Chọn đủ option group (`required` / min–max).
3. **Thêm giỏ** hoặc **Mua ngay**. Giỏ **1 quán**; conflict → confirm xóa giỏ cũ (`CART_SELLER_CONFLICT`).
4. `/cart` → chỉnh SL → `/checkout`.
5. Checkout (`isActiveBuyer`):
   - `AddressPicker` bắt buộc
   - `DeliveryTimePicker` + `minDeliveryWindowMinutes` (mặc định 30)
   - Lọc theo `operatingWindows` nếu shop có
   - `cash` | `bank_transfer`
   - `Idempotency-Key` UUID
6. → `/orders/:id`.

### Laundry

1. `/laundry` → chọn dịch vụ → `/laundry/book/:serviceId`.
2. Pickup: gap tối thiểu **30 phút**, trong `operatingWindows`.
3. Return: `DatedTimePicker`, ≥ pickup + `laundryMinReturnGapMinutes` (mặc định 60), 14 ngày tới.
4. Địa chỉ lấy / trả; optional `autoConfirmQuote`.
5. `createLaundry` → order detail (xác nhận/từ chối giá nếu cần).

### Ship

1. `/ship` hoặc `/ship/book/:sellerId` → `ShipProxyForm`.
2. Bắt buộc: mã vận đơn, điểm lấy, SĐT nhận, địa chỉ trả, SĐT liên hệ, giá trị hàng > 0.
3. Pickup gap 30 phút; return ≥ pickup + 30 phút, horizon 30 ngày.
4. **Chỉ** `bank_transfer`; UI hiện `packageValue + shipProxyFee`.
5. → order detail (upload biên lai sau khi seller accept).

## 2.9. Z-index (thứ tự lớp)

| z | Thành phần |
|---|------------|
| 70 | Time picker overlay |
| 80 | Modal mặc định, overlay ảnh store |
| 90 | Promo popup, food sheet, feed lightbox |
| 100 | Toast, seller bottom nav |
| 110 | Confirm, seller more-menu |
| 120 | Product CRUD modal, complaint chat seller |

## 2.10. UX rules nhỏ

- Promo popup: chỉ banner `isPopup`, tối đa 1 lần/ngày theo `localStorage`.
- Time step: **10 phút**.
- Sticky cart ẩn trên `/cart`, `/checkout`.
- PWA install dismiss 24h.
- Logout: clear local trước, rồi API.
- Cancel đơn (UI): food/laundry chủ yếu khi `pending`.

Tiếp: [03 — API](./technical-03-api.md)
