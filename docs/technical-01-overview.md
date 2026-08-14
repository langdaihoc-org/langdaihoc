# 01 — Tổng quan & kiến trúc

> Quay lại [mục lục](./technical-overview.md)

## 1.1. Sản phẩm

**Làng Đại Học** là marketplace **mobile-first** phục vụ khu Làng Đại học / KTX (Đông Hòa, Dĩ An, …).

Ba dịch vụ trên cùng một app:

| `service_type` / `order_type` | Người mua làm gì | Người bán |
|------------------------------|------------------|-----------|
| `food` | Chọn món → giỏ → khung giờ giao → thanh toán | Quán ăn |
| `laundry` | Chọn dịch vụ → lịch lấy/trả → (báo giá) → giặt | Tiệm giặt |
| `ship_proxy` | Điền mã vận đơn / điểm nhận → CK phí+giá trị hàng | Đơn vị nhận hộ |

Ba vai trò (`user_role`):

| Role | Home mặc định | Ghi chú |
|------|---------------|---------|
| `buyer` | `/` | Có thể bị `pending_email_verification` / `suspended` |
| `seller` | `/seller` | Shop phải `sellers.status = approved` mới bán |
| `admin` | `/admin` | Duyệt seller, CMS, khiếu nại |

Một user có thể có nhiều role qua bảng `user_roles`; `profiles.role` là role “chính” dùng điều hướng.

## 1.2. Nguyên tắc kiến trúc

1. **SPA + API tách origin** — Web Vercel, API Railway; cookie cross-site (`SameSite=None` + `Secure`) + kiểm tra Origin.
2. **API là nguồn sự thật** — giá, trạng thái đơn, quyền chuyển trạng thái không tin client.
3. **Shared package** — FSM đơn, giờ mở cửa, label VI dùng chung FE/BE để khỏi lệch.
4. **Counter O(1)** — badge/pulse không scan toàn bộ `orders` mỗi lần poll.
5. **Retention** — đơn settled ~7 ngày bị purge; thống kê sống ở `*_counters` / `seller_daily_stats`.

## 1.3. Sơ đồ thành phần

```text
┌────────────────────────────────────────────────────────────┐
│                     Clients (mobile/desktop)                │
└────────────────────────────┬───────────────────────────────┘
                             │ HTTPS
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Web — Vercel                                               │
│  Vite + React 19 + React Router 7 + TanStack Query          │
│  VITE_API_URL → API                                         │
└────────────────────────────┬───────────────────────────────┘
                             │ REST + cookie (credentials)
                             ▼
┌────────────────────────────────────────────────────────────┐
│  API — Railway (Node/Express)                               │
│  /api/health|auth|catalog|cart|orders|buyer|seller|admin    │
│  Drizzle + postgres.js (prepare: false, DB_POOL_MAX)        │
└───────┬──────────────────┬──────────────────┬──────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌──────────────────┐
│ Supabase PG   │  │ Supabase Auth │  │ R2 + Storage     │
│ Transaction   │  │ JWT / OAuth   │  │ public + proofs  │
│ pooler :6543  │  │               │  │                  │
└───────────────┘  └───────────────┘  └──────────────────┘
```

## 1.4. Monorepo

```text
langdaihoc/
├── apps/web          @langdaihoc/web
├── apps/api          @langdaihoc/api
├── packages/shared   @langdaihoc/shared
├── packages/database @langdaihoc/database
├── docs/
├── scripts/          # cẩn thận — nhiều script destructive
├── vercel.json
└── railway.toml
```

| Lệnh | Việc |
|------|------|
| `pnpm install` | Cài workspace |
| `pnpm setup:local` | Supabase local + migrate |
| `pnpm dev` | Web :5173 + API :3001 |
| `pnpm verify` | typecheck + lint + unit + build |
| `pnpm db:generate` / `pnpm db:migrate` | Schema → SQL → apply |

## 1.5. Stack tóm tắt

| Lớp | Công nghệ |
|-----|-----------|
| FE | React 19, Vite 6, RR 7, TanStack Query, RHF, Zod, Tailwind 4 |
| BE | Express, Drizzle, postgres.js, helmet, cors, rate-limit |
| Auth | Supabase Auth + cookie session API |
| DB | PostgreSQL (Supabase) |
| CI | GitHub Actions |
| Host | Vercel + Railway |

## 1.6. Thuật ngữ

| Thuật ngữ | Nghĩa |
|-----------|--------|
| SPA | Single Page Application |
| FSM | Finite state machine — máy trạng thái đơn |
| Idempotency-Key | UUID chống tạo trùng đơn |
| Pulse | API nhẹ đọc counter, FE poll |
| Operating windows | Khung HH:mm trong ngày quán nhận lịch |
| Transaction pooler | Supavisor port **6543** — nhiều HTTP share ít PG connection |
| Session pooler | Port **5432** — 1 client ≈ 1 backend (không dùng cho API prod) |
| Active buyer | `role=buyer` + `status=active` + `emailVerified` |
| Approved seller | `sellers.status=approved` |
| Settled order | `completed` / `cancelled` / `rejected` / `needs_support` (tùy ngữ cảnh retention) |

## 1.7. Môi trường

| Env | Web | API | DB |
|-----|-----|-----|-----|
| Local | localhost:5173 | localhost:3001 | Supabase local / Docker |
| Production | langdaihoc.xyz | api-production-65ce.up.railway.app | Supabase cloud |

Tiếp: [02 — Web](./technical-02-web.md)
