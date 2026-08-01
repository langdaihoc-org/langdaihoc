# Deploy test nội bộ — Vercel Hobby + Railway + Supabase

Môi trường **chưa mở bán**. Domain Tenten cấu hình sau.

## Chuẩn bị tài khoản

1. [GitHub](https://github.com) — private repo
2. [Supabase](https://supabase.com) — Free ổn cho test
3. [Railway](https://railway.app)
4. [Vercel](https://vercel.com) — Hobby

---

## A. Đưa code lên GitHub

```bash
git add .
git commit -m "chore: prepare internal deploy"
git branch -M main
git remote add origin https://github.com/<USER>/langdaihoc.git
git push -u origin main
```

---

## B. Supabase

1. New project → Settings → API: `URL`, `anon`, `service_role`
2. Settings → Database → Connection string (URI / pooler)
3. Local migrate:

```bash
$env:DATABASE_URL="postgresql://..."
$env:ALLOW_DEMO_SEED="0"
pnpm db:migrate
```

**Không** chạy `pnpm db:seed` lên DB cloud trừ khi cố ý (`ALLOW_DEMO_SEED=1`).

4. Authentication → URL configuration (sau khi có Vercel):
   - Site URL: `https://<project>.vercel.app`
   - Redirect: `https://<project>.vercel.app/**`

---

## C. Railway (API)

Root monorepo (`railway.toml`).

Variables:

```env
NODE_ENV=production
DEMO_MODE=false
COOKIE_SECURE=true
COOKIE_SAMESITE=none
TRUST_PROXY=1
PORT=3001
FRONTEND_URL=https://<project>.vercel.app
CORS_ORIGINS=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Ghi chú:

- `DEMO_MODE=false` mặc định (bắt verify email). Chỉ bật `true` nếu team test nội bộ **chấp nhận** bỏ verify.
- `COOKIE_SAMESITE=none` cần khi web (Vercel) ≠ API (Railway). API có kiểm tra Origin trên request mutating.
- Health: `https://<railway>/api/health`

---

## D. Vercel (web)

- Root Directory: `.`
- Build: `pnpm --filter @langdaihoc/web build`
- Output: `apps/web/dist`
- Install: `pnpm install --frozen-lockfile`
- Env:
  - `VITE_API_URL=https://<railway>`
  - `VITE_SUPABASE_URL=` (cùng project Supabase)
  - `VITE_SUPABASE_ANON_KEY=` (anon public)

Sau deploy: cập nhật Railway `FRONTEND_URL` + Supabase Auth URLs.

Health:
- Liveness: `GET /api/health`
- Readiness (DB): `GET /api/health/ready`

**Lưu ý:** `DEMO_MODE=true` bị **cấm** khi `NODE_ENV=production` (API không boot). Test nội bộ bỏ verify email → staging riêng hoặc tạm `NODE_ENV` không phải production (không khuyến nghị).

---

## E. Smoke

Đăng ký / đăng nhập trên URL Vercel. Nếu session không giữ: kiểm tra `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `FRONTEND_URL` khớp.

---

## Chi phí

Hobby + Railway + Supabase Free: thường khoảng **$0–15**/tháng tùy Railway.
