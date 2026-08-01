# Làng Đại Học (langdaihoc)

Nền tảng đặt đồ ăn, giặt đồ và nhận ship hộ quanh khu Làng Đại Học / KTX.

**Tên miền production:** [langdaihoc.com.vn](https://langdaihoc.com.vn)

## Yêu cầu phát triển local

- Node.js 20+
- pnpm 9+
- Docker (Supabase local)

## Chạy nhanh (local)

```bash
pnpm setup:local   # Supabase + migrate + seed (lần đầu)
pnpm dev
```

Hoặc từng bước:

```bash
pnpm install
pnpm supabase:start
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/health

Sau `pnpm db:seed`, terminal in danh sách tài khoản **local** (email `@demo.local`). Mật khẩu lấy từ biến `SEED_PASSWORD` hoặc mặc định trong seed — **không dùng trên production / DB cloud**.

## Kiểm thử / trước khi deploy

```bash
pnpm verify             # typecheck + unit + build (bắt buộc trước release)
pnpm test:unit          # Vitest — transitions & pricing
pnpm reset:demo         # khôi phục seller/user local + xóa giỏ buyer
pnpm test:e2e           # Playwright
pnpm test:smoke         # smoke API workflows
```

### Production checklist

- `NODE_ENV=production`
- `DEMO_MODE=false` (hoặc bỏ trống) trên API
- `FRONTEND_URL` = URL web thật
- `COOKIE_SECURE=true` (+ `COOKIE_SAMESITE=none` chỉ khi web/API khác origin)
- Không chạy `pnpm db:seed` / `reset:demo` / `purge-*` lên DB production
- Cấu hình Supabase URL/keys, `DATABASE_URL` thật

CI GitHub Actions (`.github/workflows/ci.yml`) chạy `typecheck` → `test:unit` → `build` trên mọi PR/push.

## Tài liệu

- [Deploy test nội bộ](./docs/deploy-internal.md)
- [Design decisions](./docs/design-decisions.md)
