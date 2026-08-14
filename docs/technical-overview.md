# Tài liệu kỹ thuật Làng Đại Học — Mục lục

> Bộ tài liệu nội bộ cho team kỹ thuật / vận hành / QA.  
> Cập nhật: **2026-08-14**  
> Production web: https://langdaihoc.xyz · API: https://api-production-65ce.up.railway.app  
> Repo: `langdaihoc-org/langdaihoc`

Đọc theo thứ tự nếu mới vào team: **01 → 02 → 03 → 04 → 05 → 06**.

| # | Tài liệu | Nội dung |
|---|----------|----------|
| 01 | [Tổng quan & kiến trúc](./technical-01-overview.md) | Sản phẩm, sơ đồ hệ thống, monorepo, stack, thuật ngữ |
| 02 | [Web (frontend)](./technical-02-web.md) | Mọi route, component, lib, flow buyer/seller/admin, z-index, UX |
| 03 | [API (backend)](./technical-03-api.md) | Mọi router/endpoint, middleware, service, job, lib |
| 04 | [Nghiệp vụ đơn & thanh toán](./technical-04-orders.md) | State machine, ai được bấm, food/laundry/ship, payment |
| 05 | [Database & shared](./technical-05-database.md) | Enum, bảng, index, counter, migration, package shared |
| 06 | [Infra, bảo mật, vận hành](./technical-06-ops.md) | Env, pooler, deploy, CI, capacity, checklist, lỗi hay gặp |

Tài liệu liên quan cũ hơn (vẫn hữu ích):

- [Design decisions (UI)](./design-decisions.md)
- [Deploy checklist nội bộ](./deploy-internal.md)

---

## Sơ đồ một trang

```text
Buyer/Seller/Admin  →  Web (Vercel, SPA)  →  API (Railway, Express)
                                              ↓
                                    Supabase Postgres (:6543 transaction pooler)
                                    Supabase Auth + Storage (biên lai)
                                    Cloudflare R2 (ảnh public)
```

## Ai đọc phần nào?

| Vai trò | Nên đọc |
|---------|---------|
| Frontend | 01, **02**, 04 (flow), 06 (CORS/cookie/Vercel) |
| Backend | 01, **03**, **04**, **05**, 06 |
| QA / CS kỹ thuật | 01, 02 (flow), **04**, 06 (checklist smoke) |
| DevOps | 01, **06**, 05 (migrate) |
| Product | 01, 04 |
