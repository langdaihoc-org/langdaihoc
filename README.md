# Làng Đại Học (langdaihoc)

Nền tảng đặt đồ ăn, giặt đồ và nhận ship hộ quanh khu Làng Đại Học / KTX.

**Tên miền production:** [langdaihoc.xyz](https://langdaihoc.xyz)

## Yêu cầu phát triển local

- Node.js 20+
- pnpm 9+
- Docker (Supabase local)

## Chạy nhanh (local)

```bash
pnpm setup:local   # Supabase + migrate (lần đầu)
pnpm dev
```

Hoặc từng bước:

```bash
pnpm install
pnpm supabase:start
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/health

## Kiểm thử / trước khi deploy

```bash
pnpm verify             # typecheck + unit + build (bắt buộc trước release)
pnpm test:unit          # Vitest — transitions & pricing
```

### Production checklist

- `NODE_ENV=production`
- `FRONTEND_URL` = URL web thật
- `COOKIE_SECURE=true` (+ `COOKIE_SAMESITE=none` chỉ khi web/API khác origin)
- Không chạy script wipe/purge lên DB production trừ khi cố ý + dual confirm
- Cấu hình Supabase URL/keys, `DATABASE_URL` thật

CI GitHub Actions (`.github/workflows/ci.yml`) chạy `typecheck` → `test:unit` → `build` trên mọi PR/push.

## Tài liệu

- [Deploy test nội bộ](./docs/deploy-internal.md)
- [Design decisions](./docs/design-decisions.md)
