# 05 — Database & package shared

> [Mục lục](./technical-overview.md) · [04 Đơn](./technical-04-orders.md) · [06 Ops](./technical-06-ops.md)

Schema: `packages/database/src/schema/*`  
Shared: `packages/shared/src/*`  
Migrate: `packages/database/drizzle/` + `meta/_journal.json`

## 5.1. Kết nối DB từ API

```ts
// packages/database/src/index.ts
createDb(DATABASE_URL) → postgres.js {
  prepare: false,           // bắt buộc với transaction pooler
  max: DB_POOL_MAX (clamp 5..50, default 25; prod khuyến nghị 10),
  idle_timeout: 20,
  max_lifetime: 30 phút,
}
```

## 5.2. Enums Postgres (chính)

| Enum | Giá trị |
|------|---------|
| `user_role` | buyer, seller, admin |
| `user_status` | pending_email_verification, active, suspended, deleted |
| `seller_status` | pending, approved, rejected, suspended |
| `service_type` | food, laundry, ship_proxy |
| `address_type` | dorm, rental, other |
| `order_type` | food, laundry, ship_proxy |
| `payment_method` | cash, bank_transfer |
| `payment_status` | unpaid, pending, proof_uploaded, verified, rejected, paid |
| `laundry_unit` | kg, item, load |
| `complaint_status` | new, processing, waiting_seller, resolved, rejected |
| `proof_status` | pending, proof_uploaded, verified, rejected |
| `post_status` | published, hidden, pending, rejected |
| `category_type` | food, laundry |

**Lưu ý:** `orders.status` là `varchar` (không enum PG) — ship statuses chỉ khai báo ở shared TS.

## 5.3. Bảng theo nhóm

### Auth / identity

| Bảng | Mục đích |
|------|----------|
| `profiles` | User: email, role chính, status, tên, phone, avatar |
| `user_roles` | Multi-role (unique user+role) |
| `sellers` | Shop: serviceTypes, hours, windows, fees, rating aggregates, acceptingOrders, gaps, … |
| `buyer_addresses` | Sổ địa chỉ |
| `audit_logs` | Audit admin |

### Catalog / giỏ

| Bảng | Mục đích |
|------|----------|
| `categories` | Danh mục |
| `food_items` | Món (+ `image_urls`, multi category JSON) |
| `food_option_groups` | required / minSelect / maxSelect |
| `food_item_options` | priceDelta |
| `laundry_services` | SKU giặt |
| `carts` / `cart_items` | Giỏ + snapshot options |
| `seller_bank_accounts` | STK / QR |

### Đơn

| Bảng | Mục đích |
|------|----------|
| `orders` | Header: code, type, status, tiền, địa chỉ JSON, lịch, version, lateDeliveryWarnedAt, statsRecordedAt |
| `order_items` | Dòng food |
| `laundry_order_details` | qty, quote, finalPrice, autoConfirmQuote, timestamps confirm |
| `ship_proxy_order_details` | tracking, pickup/return, phones, packageValue |
| `order_status_history` | Log chuyển trạng thái |
| `payment_proofs` | Biên lai |
| `checkout_idempotency_keys` | Chống double checkout |

### Xã hội / hỗ trợ

| Bảng | Mục đích |
|------|----------|
| `reviews` | Đánh giá (giữ sau khi xóa order qua SET NULL + orderCode) |
| `complaints` / `complaint_messages` | Khiếu nại (1 đơn 1 complaint) |
| `notifications` | Inbox |
| `banners` | Banner / popup |
| `posts` | Feed |
| `site_feedback` | Feedback footer |

### Stats / jobs / settings

| Bảng | Mục đích |
|------|----------|
| `seller_daily_stats` | PK (seller_id, day) — đơn hoàn thành + doanh thu / ngày VN |
| `seller_counters` | Pulse seller O(1) |
| `buyer_counters` | Pulse buyer O(1) |
| `platform_settings` | KV (vd. `billing_period_started_at`) |
| `job_runs` | Watermark job retention |

### Seller columns lịch/giá đáng nhớ

- `operating_windows` JSONB `{from,to}[]`
- `open_hours` text hiển thị
- `min_delivery_window_minutes`
- `laundry_min_return_gap_minutes`
- `ship_proxy_fee_vnd`
- `rating_sum` / `rating_count`

## 5.4. Index quan trọng

- Orders: buyer+created, seller+status, seller+created, status+created, partial **open** buyer/seller
- Notifications: user, unread partial
- Complaints: seller open partial, unique order
- Food/laundry available partial sort
- Banners active, posts feed
- Idempotency unique (user_id, key)
- Profiles phone unique (migration)

## 5.5. Counters — ý nghĩa vận hành

FE gọi `GET /api/orders/pulse` → đọc `buyer_counters` / `seller_counters` (pending, open, delivering, late, complaints, unread, latest_*).

Khi đơn đổi trạng thái / hoàn thành / thông báo: service `counters.ts` cập nhật.  
Khi retention xóa đơn cũ: số liệu lifetime/daily **không mất** nếu đã rollup.

## 5.6. Migration

| Việc | Lệnh |
|------|------|
| Đổi schema TS | sửa `packages/database/src/schema` |
| Sinh SQL | `pnpm db:generate` |
| Apply | `DATABASE_URL=... pnpm db:migrate` |

File: `drizzle/NNNN_ten.sql`. Journal: `meta/_journal.json`.

**Prod API** dùng transaction `:6543`. **Migrate** nên Session `:5432` hoặc Direct.

## 5.7. Package `@langdaihoc/shared`

| Module | Việc |
|--------|------|
| `enums.ts` | Const union đồng bộ domain (gồm ship statuses) |
| `utils.ts` | FSM + actor + `extractEmailDomain` |
| `pricing.ts` | Tính giá food/laundry; `SHIP_PROXY_FEE_VND` fallback |
| `operating-hours.ts` | HH:mm, `SHOP_TZ`, validate cửa sổ |
| `labels.ts` | Label tiếng Việt + localize notification cũ |
| `phone.ts` | Chuẩn hóa SĐT VN |
| `safe-url.ts` | Chặn `javascript:` / URL nguy hiểm trên banner/post |
| `order-summary.ts` | Chuỗi tóm tắt đơn |
| `schemas/auth.ts` | Zod register/login/… |

Unit test: `pnpm --filter @langdaihoc/shared test` (transitions, pricing, operating-hours, …).

## 5.8. Retention & dữ liệu “sống”

Sau ~7 ngày đơn settled có thể bị xóa khỏi `orders`. Những gì còn:

- `seller_daily_stats`, counters lifetime  
- reviews / complaints (TTL riêng)  
- Không dựa vào `GET /orders` lịch sử lâu năm cho báo cáo tháng — dùng stats/billing period admin  

Tiếp: [06 — Ops](./technical-06-ops.md)
