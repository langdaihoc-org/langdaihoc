# 03 — API (backend)

> [Mục lục](./technical-overview.md) · [02 Web](./technical-02-web.md) · [04 Đơn](./technical-04-orders.md)

Entry: `apps/api/src/index.ts` · Env: `load-env.ts` (local `.env`; prod không override biến host).

## 3.1. Pipeline request

```text
helmet → cors (credentials) → express.json(7mb) → cookieParser
  → requireTrustedOrigin → routers → errorHandler
```

`app.locals`: `db`, `supabaseAdmin`.  
Startup: `scheduleDataRetention(...)`.

## 3.2. Mount routers

| Prefix | File |
|--------|------|
| `/api/health` | `modules/health/routes.ts` |
| `/api/auth` | `modules/auth/routes.ts` |
| `/api/catalog` | `modules/catalog/routes.ts` |
| `/api/cart` | `modules/cart/routes.ts` |
| `/api/orders` | `modules/orders/routes.ts` |
| `/api/buyer` | `modules/buyer/routes.ts` |
| `/api/seller` | `modules/seller/routes.ts` |
| `/api/admin` | `modules/admin/routes.ts` |

## 3.3. Middleware cốt lõi

### Auth — `middleware/auth.ts`

| Export | Việc |
|--------|------|
| `requireAuth` | Cookie hoặc Bearer → verify JWT (local JWKS ưu tiên) → load `profiles`; cache ~30s |
| `optionalAuth` | Có thì gắn user |
| `requireRole(...roles)` | 403 sai role |
| `requireActiveBuyer` | buyer + verified + active |
| `invalidateAuthCache*` / `primeAuthCache` | Sau đổi profile/password |

### CSRF Origin — `middleware/csrf-origin.ts`

- GET/HEAD/OPTIONS: bỏ qua.
- Mutating + **có session cookie**: Origin/Referer phải trong allowlist CORS → không thì **403** (`Thiếu Origin` hay tương đương).
- Mutating chỉ Bearer (không cookie session): cho phép (script/tool).

### Errors — `middleware/error-handler.ts`

- `AppError(status, message, code)` → JSON `{ error: { message, code } }`
- Zod → 400 `VALIDATION_ERROR`
- Khác → 500 `INTERNAL_ERROR` (+ `console.error`)

### Rate limit (prod)

| Nơi | Tên | Cửa sổ / max |
|-----|-----|----------------|
| auth | authLimiter | 15m / 20 |
| auth | loginLimiter | 15m / 30 |
| auth | forgotLimiter | 15m / 10 |
| auth | recoveryLimiter | 15m / 20 |
| auth | refreshLimiter | 15m / 120 |
| auth | resendLimiter | 1h / 5 |
| auth | changePasswordLimiter | 15m / 10 |
| catalog | feedbackLimiter | 15m / 8 |
| orders | createOrderLimiter | 5m / 20 |
| orders | proofLimiter | 5m / 10 |
| buyer upload | uploadLimiter | 5m / 20 |
| seller/admin upload | uploadLimiter | 5m / 40 |

Dev/test nới lỏng hơn. Prod bật `trust proxy` để IP đúng sau proxy.

Seller: thêm `requireApprovedSeller` trên mutation catalog/bank/posts/complaints.

## 3.4. Health

| Method | Path | Việc |
|--------|------|------|
| GET | `/api/health` | Liveness |
| GET | `/api/health/ready` | SELECT 1 kiểu qua `profiles` |

## 3.5. Auth routes (`/api/auth`)

| Method | Path | Auth | Việc |
|--------|------|------|------|
| POST | `/register/buyer` | public | Đăng ký buyer + mail verify |
| POST | `/register/seller` | public | Đăng ký seller shop `pending` |
| POST | `/login` | public | Cookie session (`rememberMe`) |
| POST | `/oauth/session` | public | Đổi token Google → cookie |
| POST | `/logout` | cookie | Sign-out + clear |
| POST | `/refresh` | refresh cookie | Gia hạn |
| GET | `/me` | auth | User hiện tại |
| PATCH | `/profile` | auth | Tên/SĐT/avatar |
| POST | `/forgot-password` | public | Mail reset |
| POST | `/verify-recovery` | public | OTP → recovery cookie |
| POST | `/verify-email` | public | Xác nhận email |
| POST | `/reset-password` | recovery | Đặt MK mới |
| POST | `/set-password` | auth | Lần đầu OAuth |
| POST | `/change-password` | auth | Đổi MK (cần MK cũ) |
| POST | `/resend-verification` | public | Gửi lại mail |
| GET | `/verify-callback` | public | Redirect FE `?verified=1` |

Cookie names / options: `lib/supabase.ts`, `lib/session.ts` (`ldh_*`).

## 3.6. Catalog (`/api/catalog`) — public + cache header

| Method | Path | Việc |
|--------|------|------|
| GET | `/home` | Food + laundry + categories + banners (+ popup) aggregate |
| GET | `/banners` | `?popup` |
| GET | `/posts`, `/posts/:id` | Feed |
| GET | `/categories` | `?type` |
| GET | `/sellers`, `/sellers/:id`, `/sellers/:id/reviews` | Quán đã approve |
| GET | `/food`, `/food/:id` | Món (+ options ở detail) |
| GET | `/laundry` | Danh sách dịch vụ (`?sellerId`) — **không** có `/laundry/:id` |
| POST | `/feedback` | optionalAuth + limit |

## 3.7. Cart (`/api/cart`) — active buyer

| Method | Path | Việc |
|--------|------|------|
| GET | `/` | Giỏ |
| POST | `/items` | Thêm (`forceClear`, options) |
| PATCH | `/items/:id` | Đổi SL |
| DELETE | `/items/:id` | Xóa dòng |
| DELETE | `/` | Clear |

## 3.8. Orders (`/api/orders`)

| Method | Path | Ai | Việc |
|--------|------|-----|------|
| GET | `/pulse` | auth | Counter nhẹ |
| GET | `/bank-info/:sellerId` | auth + ACL | STK CK |
| GET | `/` | auth | List (`scope`, `view=summary`) |
| GET | `/:id` | auth + ACL | Chi tiết (+ proof re-sign) |
| POST | `/food/checkout` | buyerGuard + idem | Checkout giỏ |
| POST | `/laundry` | buyerGuard + idem | Tạo đơn giặt |
| POST | `/ship-proxy` | buyerGuard + idem | Tạo ship |
| PATCH | `/:id/status` | auth + actor | Đổi trạng thái |
| POST | `/:id/laundry-quote` | seller | Báo giá |
| POST | `/:id/confirm-price` | buyer | Đồng ý giá |
| POST | `/:id/reject-price` | buyer | Từ chối giá → cancel |
| POST | `/:id/late-delivery-warning` | buyer | Cảnh báo trễ (food) |
| POST | `/:id/payment-proof` | buyer | Gửi URL biên lai |
| POST | `/:id/verify-payment` | seller | Duyệt/từ chối CK |
| POST | `/:id/mark-paid` | seller | Đánh dấu thu tiền mặt (delivering/returning); bắt buộc trước khi hoàn thành |
| POST | `/:id/review` | buyer | Đánh giá |
| PATCH | `/:id/review` | buyer | Sửa review |
| POST | `/:id/complaint` | buyer | Mở khiếu nại |
| POST | `/:id/complaint/escalate` | buyer | Đẩy admin |
| POST | `/:id/complaint/messages` | buyer | Tin nhắn |

**Idempotency:** header `Idempotency-Key` hoặc body `idempotencyKey` (UUID) bắt buộc khi tạo đơn.

## 3.9. Buyer (`/api/buyer`) — role buyer

Addresses CRUD; profile (đổi email cần password + re-verify); notifications (+ read/read-all); `POST /upload` proof private gắn `orderId`.

## 3.10. Seller (`/api/seller`) — role seller

| Nhóm | Endpoints |
|------|-----------|
| Shop | `GET/PATCH /shop` |
| Upload | `POST /upload` (approved) |
| Food | CRUD `/food-items` |
| Laundry | CRUD `/laundry-services` |
| Bank | CRUD `/bank-accounts` |
| Posts | CRUD `/posts` |
| Complaints | list, messages, resolve |
| Notifications | list, read, read-all |

`PATCH /shop` nhận: `shopName`, mô tả, địa chỉ, phone, `openHours`, **`operatingWindows`**, `minDeliveryWindowMinutes`, `laundryMinReturnGapMinutes`, `shipProxyFeeVnd`, `acceptingOrders`, `laundryAutoConfirmQuote` (nếu còn), avatar, service areas, …

## 3.11. Admin (`/api/admin`) — role admin

Stats; sellers approve/reject/suspend/delete; tạo ship seller; billing period get/reset; users; categories; audit; orders; complaints; banners; posts; feedback; upload.

## 3.12. Services

### `services/commerce.ts`

Catalog, cart, `checkoutFood`, `createLaundryOrder`, `createShipProxyOrder`, `transitionOrder`, list/enrich orders, ratings, banners/posts, `notifyUser`, order codes `FD-/LD-/SP-`.

Validate giờ: operating windows + min delivery/laundry gap (xem doc 04).

### `services/counters.ts`

`refreshSellerCounters` / `refreshBuyerCounters`, `recordOrderCompleted`, rating bump, unread bump/clear.

## 3.13. Jobs

| Job | Lịch | Việc |
|-----|------|------|
| `data-retention` | Startup (nếu ≥20h) + **00:00 VN** | Advisory xact lock → rollup stats → purge notifications/orders/posts/… theo TTL |
| `daily-schedule.ts` | helper | `scheduleDailyAtMidnight` |

TTL tiêu biểu: orders settled 7d (+ xóa file proof); notifications 7d; idempotency 14d; audit 30d; reviews 90d; posts 7d; …

## 3.14. Lib đáng nhớ

| File | Việc |
|------|------|
| `env.ts` | `getDatabaseUrl`, `getFrontendUrl`, `buildCorsOrigins`, fail-closed prod |
| `supabase.ts` | Admin/anon client, cookie names |
| `session.ts` | Set/clear session & recovery cookies, remember-me |
| `jwt-verify.ts` | Verify ES256 local (JWKS cache) |
| `storage.ts` | Upload, assert URL, resign private proof, xóa ảnh |
| `r2.ts` | Optional R2 public |
| `order-access.ts` | `loadOrderForActor`, `assertSellerApprovedToMutate` |
| `billing-period.ts` | Kỳ doanh thu admin |
| `audit.ts` | `writeAudit` |
| `http-cache.ts` | `Cache-Control` catalog |
| `params.ts` | `paramId` |

Tiếp: [04 — Nghiệp vụ đơn](./technical-04-orders.md)
