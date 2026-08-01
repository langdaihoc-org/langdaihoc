# Kế hoạch triển khai local — Phase L0 → L8

> **Lịch sử** — kế hoạch giai đoạn đầu. Trạng thái dưới đây có thể đã lỗi thời. Xem [README](../README.md).

> Theo `LangDaiHoc_DacTa_Web.docx` §14.

## Trạng thái tổng quan

| Phase | Tên | Trạng thái | Ghi chú |
|-------|-----|------------|---------|
| **L0** | Audit + baseline | 🟡 Đang làm | Root scripts, README |
| **L1** | Design system + routing | 🟡 Đang làm | Tokens, nav, skeleton, toast |
| **L2** | Supabase + Auth | 🟢 Done | user_roles, switch-role, verify block |
| **L3** | Catalog + Seller catalog | ✅ Done | Pagination, option groups, upload, pending guard |
| **L4** | Food cart + order | ✅ Done | ConfirmDialog, idempotency checkout, toast |
| **L5** | Laundry order | ✅ Done | Booking form, quote breakdown UI |
| **L6** | Payment & complaint | ✅ Done | Upload biên lai, complaint thread, review tags |
| **L7** | Admin Center | 🟡 Partial | Thiếu Users, Categories admin |
| **L8** | Seed, QA, README | 🔴 Chưa | Test auto, seed đẹp |

---

## L0 — Audit và chạy baseline

**Mục tiêu:** `pnpm install`, `pnpm dev`, web + API health.

- [x] Audit repository → `docs/local-audit-report.md`
- [ ] `pnpm-workspace.yaml` + root `package.json`
- [ ] Scripts: `dev`, `build`, `typecheck`
- [ ] `.env.example` tập trung
- [ ] README setup máy sạch

**Nghiệm thu:** http://localhost:5173 + http://localhost:3001/health

---

## L1 — Design system và routing

**Mục tiêu:** Tokens đặc tả, layout 4 role, empty/loading.

- [x] `docs/design-decisions.md`
- [ ] Tokens CSS (#EB7529, #268259, #FFF8F0)
- [ ] Buyer bottom nav: Trang chủ · Ăn uống · Giặt đồ · Đơn hàng · Tôi
- [ ] Home: hero search, banner, quick actions, laundry preview
- [ ] Skeleton, Toast components
- [ ] LaundryCard component

**Nghiệm thu:** Mobile 360px không tràn; 5 tab bottom nav hoạt động.

---

## L2 — Supabase local + Auth

- [x] `supabase/config.toml` + `.env.example`
- [x] `user_roles` table + migration backfill
- [x] API `/auth/me` trả `roles[]`, `activeRole`
- [x] `POST /auth/switch-role` + cookie
- [x] Role switcher UI (buyer header + seller/admin sidebar)
- [x] Block checkout khi chưa verify email
- [x] Mailpit link trong banner xác minh
- [x] Demo dual-role: `student.shop@hcmut.edu.vn`

---

## L3 — Catalog

- [x] Pagination `/catalog/food?page=&limit=`
- [x] Food option groups (required, min/max)
- [x] Supabase Storage upload ảnh món
- [x] Seller pending → block CRUD

---

## L4 — Food order

- [x] ConfirmDialog cart seller conflict
- [x] Idempotency key checkout
- [x] Toast success sau đặt hàng

---

## L5 — Laundry

- [x] Booking form đầy đủ (pickup/return address)
- [x] UI chờ báo giá + breakdown

---

## L6 — Payment & complaint

- [x] ImageUploader → Storage bucket `payment-proofs`
- [x] Complaint message thread UI
- [x] Review tags

---

## L7 — Admin

- [ ] Trang Users, Categories
- [ ] Seller approval: chọn loại dịch vụ food/laundry/both
- [ ] Audit log cơ bản

---

## L8 — Seed & QA

- [ ] Seed: 3+ seller, 20+ món, 5+ orders các trạng thái
- [ ] Vitest unit (transitions, pricing)
- [ ] Playwright smoke: login → đặt món
- [ ] `pnpm setup:local` one-shot script

---

## Tài khoản local (seed)

Sau `pnpm db:seed`, xem output terminal. Email dạng `@demo.local` / buyer local — **chỉ** dùng trên Supabase local. Không ghi mật khẩu vào repo / README.
