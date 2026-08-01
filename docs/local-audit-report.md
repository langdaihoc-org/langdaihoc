> **Lịch sử** — không phản ánh trạng thái code hiện tại. Xem [README](../README.md) và [deploy-internal](./deploy-internal.md).

# Báo cáo audit local — Làng Đại Học


## 1. Những gì đã có

| Hạng mục | Trạng thái | Ghi chú |
|----------|------------|---------|
| Monorepo apps/web + apps/api | ✅ | React 19 + Vite, Express 5 |
| packages/database + shared | ✅ | Drizzle schema, enums, transitions |
| Auth (email/password) | ✅ | Supabase Auth, register buyer/seller |
| Buyer UI | ✅ ~80% | Home, food, laundry, cart, checkout, orders, profile |
| Seller Center | ✅ ~70% | Dashboard, menu, laundry, orders, bank, profile |
| Admin Center | ✅ ~65% | Stats, sellers, orders, complaints, banners |
| Role isolation | ✅ | BuyerOnlyLayout, ProtectedRoute |
| API client | ✅ | `apps/web/src/lib/api.ts` |
| Design tokens | ⚠️ | Có nhưng lệch màu đặc tả (#ff6b35 vs #EB7529) |
| code-completion | 📁 | Prototype tham khảo, không chạy chính |

## 2. Lỗi / thiếu so với đặc tả

### L0 — Baseline
- ❌ Thiếu `package.json` + `pnpm-workspace.yaml` ở root
- ❌ Thiếu `pnpm dev` chạy web + API cùng lúc
- ❌ Thiếu `docs/`, `.env.example` tập trung, `supabase/` folder
- ❌ Thiếu README setup máy sạch

### L1 — Design system
- ⚠️ Bottom nav mobile thiếu tab **Tôi** (`/profile`)
- ⚠️ Home thiếu hero search + quick action đơn đang xử lý + laundry preview
- ❌ Skeleton, Toast, ConfirmDialog chưa đủ
- ⚠️ Màu brand chưa khớp đặc tả

### L2 — Auth
- ⚠️ `user_roles` multi-role chưa đầy đủ (dùng `profiles.role` đơn)
- ⚠️ Menu chuyển Buyer ↔ Seller khi user có nhiều role
- ✅ Verify email flow cơ bản (đăng ký email bất kỳ; domain trường đã gỡ khỏi DB)

### L3–L7 — Nghiệp vụ
- ⚠️ Food options/topping configurator cơ bản, chưa đủ min/max group
- ⚠️ Pagination catalog chưa có
- ⚠️ Image upload qua Storage chưa có (URL string)
- ⚠️ Complaint thread (buyer/seller/admin) chưa đủ UI
- ⚠️ Admin: Users, Danh mục CRUD chưa có trang
- ⚠️ Seller: trang Đánh giá chưa có
- ⚠️ Audit log admin chưa có

### L8 — QA
- ❌ Vitest/Playwright smoke test
- ❌ Seed data phong phú theo spec (nhiều seller, orders mẫu)

## 3. Dữ liệu mock / hard-code

- KTX "KTX Khu B" trên header — placeholder, chưa bind address buyer
- Khoảng cách "1.2 km" trên store card — seed/demo
- Một số stat dashboard admin từng hard-code (đã sửa stats API)

## 4. Rủi ro

| Rủi ro | Mức | Mitigation |
|--------|-----|------------|
| Single role trong profile vs multi-role spec | Trung bình | Phase L2: `user_roles` + role switcher |
| Không có root scripts | Cao | Tạo pnpm workspace + `pnpm dev` |
| Supabase không chạy → app trống | Trung bình | README + health check rõ ràng |
| Frontend gửi giá (cart) | Thấp | Backend đã tính lại giá checkout |

## 5. File ưu tiên sửa (phase tiếp theo)

1. `package.json`, `pnpm-workspace.yaml` (root)
2. `apps/web/src/index.css` — tokens đặc tả
3. `apps/web/src/components/layout/responsive-layout.tsx` — nav 5 tab
4. `apps/web/src/pages/home-page.tsx` — hero + quick actions
5. `packages/database/src/seed.ts` — seed phong phú
6. `README.md` — setup local
