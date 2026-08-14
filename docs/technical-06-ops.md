# 06 — Infra, bảo mật, vận hành

> [Mục lục](./technical-overview.md) · [05 Database](./technical-05-database.md)

## 6.1. Sơ đồ triển khai prod

| Thành phần | Nơi | Repo trigger |
|------------|-----|--------------|
| Web | Vercel project `langdaihoc` | push `main` |
| API | Railway service `api` | push `main` (`railway.toml`) |
| DB/Auth | Supabase | — |
| Domain | `langdaihoc.xyz` → Vercel | DNS |
| GitHub | `langdaihoc-org/langdaihoc` | CI Actions |

### railway.toml

- Build: `pnpm install --frozen-lockfile && pnpm --filter @langdaihoc/api build`
- Start: `pnpm --filter @langdaihoc/api start`
- Health: `/api/health`

### vercel.json (root)

- Install: `pnpm install --frozen-lockfile --prod=false`
- Build: `pnpm --filter @langdaihoc/web build`
- Output: `apps/web/dist`
- SPA rewrite + redirect từ `*.vercel.app` → `langdaihoc.xyz`

## 6.2. Biến môi trường

### API (Railway) — bắt buộc / quan trọng

| Biến | Giá trị / ý nghĩa |
|------|-------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` (hoặc Railway gán) |
| `DATABASE_URL` | **Transaction pooler `…pooler.supabase.com:6543/postgres`** |
| `DB_POOL_MAX` | **`10`** (prod hiện tại; đừng để 25 trên free + session) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (chỉ server) |
| `FRONTEND_URL` | `https://langdaihoc.xyz` |
| `CORS_ORIGINS` | optional thêm origin |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `none` (web≠API origin) |
| `TRUST_PROXY` | `1` |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | Ảnh public |

### Web (Vercel)

| Biến | Ý nghĩa |
|------|---------|
| `VITE_API_URL` | `https://api-production-65ce.up.railway.app` (không slash cuối) |

### Local (`apps/api/.env`, `.env.example`)

Xem file example trong repo. Local DB thường `127.0.0.1:55322`.

## 6.3. Supabase pooler — checklist chắc chắn

| Mode | Port | Dùng cho |
|------|------|----------|
| Transaction | **6543** | **API Railway prod** |
| Session | 5432 | psql, migrate, tool |
| Direct | `db.*.supabase.co:5432` | admin hiếm khi (IPv6/timeout) |

Xác minh nhanh (không in password):

```bash
railway variable list --service api --json
# xem host có pooler + port 6543
```

User pooler dạng: `postgres.<PROJECT_REF>`.

**Vì sao quan trọng:** Session + `DB_POOL_MAX` cao → vài request `catalog/home` song song dễ **500**. Transaction + pool 10 → đo được concurrent cao hơn với 0% lỗi.

API code: `prepare: false` — tương thích transaction pooler.  
Lock retention: `pg_try_advisory_xact_lock` — OK.  
Không dùng LISTEN/NOTIFY / TEMP table session trên request path.

## 6.4. Bảo mật vận hành

1. Mutating + cookie → bắt Origin từ `langdaihoc.xyz` (và CORS list).
2. Không commit `.env`; không paste `DATABASE_URL` lên chat/ticket.
3. Script `scripts/*` wipe/purge: chỉ local + cờ confirm — **cấm** prod trừ khi có quy trình.
4. Proof CK: private storage + assert URL + object exists.
5. `safe-url` trên link banner/post.
6. Rate limit login: WiFi chung dễ 429 khi test nhiều account.

## 6.5. CI / Deploy pitfalls

| Hiện tượng | Nguyên nhân | Xử lý |
|------------|-------------|--------|
| GitHub commit đỏ `0/1` cũ | Thiếu `@types/node` (đã vá) | Bỏ qua lịch sử; xem CI mới |
| Đỏ `Deployment was blocked` | Author GitHub chưa trong Vercel team | Mời user + link GitHub; hoặc commit bằng `ldhwork` |
| Vercel build `tsc not found` | Install bỏ devDeps | `installCommand` có `--prod=false` |
| API 500 dưới tải | Sai port pooler / pool | Kiểm tra `:6543` + `DB_POOL_MAX` |

## 6.6. Capacity (định hướng team)

| Mục tiêu | Yêu cầu hạ tầng |
|----------|-----------------|
| Soft launch | Free + **6543** + pool 10 + (tuỳ) cache home |
| ~30k MAU / ~10k đơn/ngày | **Supabase Pro (Micro+)** + monitor latency/error + load smoke định kỳ |
| VPS | Chỉ khi mang **cả Postgres+PgBouncer**; chỉ chuyển API sang VPS mà DB free → **không** đủ |

Kiến trúc code (counter, index, idempotency, retention) **hướng** 10k đơn/ngày; infra free **không** tự đạt peak browse.

## 6.7. Checklist sau mỗi deploy

1. CI GitHub **success**
2. Railway API health **200** + ready **200**
3. Vercel Production **Ready** (không Blocked/Error)
4. Mở https://langdaihoc.xyz (hard refresh) — bundle mới
5. Login buyer test + 1 flow (food **hoặc** laundry)
6. (Tuỳ) concurrent `catalog/home` ×10 — kỳ vọng 0% lỗi

## 6.8. Smoke commands gợi ý

```bash
curl -s https://api-production-65ce.up.railway.app/api/health
curl -s https://api-production-65ce.up.railway.app/api/health/ready
curl -s https://api-production-65ce.up.railway.app/api/catalog/home | head -c 200
```

Login/mutating từ script: gửi header `Origin: https://langdaihoc.xyz`.

## 6.9. Quy trình team

1. Branch → PR → CI xanh → merge `main`.
2. Trước release lớn: `pnpm verify`.
3. Đổi schema: generate → review SQL → migrate (Session URL) → deploy API.
4. Commit author: account đã có trong Vercel team.
5. Đổi secret: rotate trên Supabase/Railway; không commit.

## 6.10. File “sổ tay” nhanh

| Cần biết | Mở |
|----------|-----|
| Route UI | `apps/web/src/app.tsx` |
| API mount | `apps/api/src/index.ts` |
| FSM | `packages/shared/src/utils.ts` |
| Checkout/giặt/ship | `apps/api/src/services/commerce.ts` |
| Schema | `packages/database/src/schema/` |
| Design UI | `docs/design-decisions.md` |

## 6.11. Lỗi người dùng / CS tra nhanh

| User thấy | Check kỹ thuật |
|-----------|----------------|
| Không đăng nhập được / 429 | Rate limit IP; đợi hoặc đổi mạng |
| Đặt đơn ngoài giờ bị chặn | `OUTSIDE_OPERATING_HOURS` — đúng thiết kế |
| Giặt trả quá gần giờ lấy | `INVALID_TIME_RANGE` |
| Ship không sang chuẩn bị | Chưa verify biên lai |
| Trang trắng / API lỗi | `VITE_API_URL`; CORS; Railway down |
| Seller không thấy nút | Chưa `approved` hoặc sai `serviceTypes` |

---

Hết bộ tài liệu kỹ thuật. Về [mục lục](./technical-overview.md).
