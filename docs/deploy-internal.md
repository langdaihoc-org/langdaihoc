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
# Cloudflare R2 — ảnh public (menu/feed/banner). Proof CK vẫn trên Supabase.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=langdaihoc-media
R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev
```

Ghi chú:

- `DEMO_MODE=false` mặc định (bắt verify email).
- **Không** bật `DEMO_MODE=true` khi `NODE_ENV=production` — API **fail boot**. Test bỏ verify → staging `NODE_ENV=development` hoặc project riêng.
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

### PWA (install-only)

Đã có `manifest.webmanifest` + `sw.js` (không cache offline). Trên Android Chrome: menu → **Cài đặt ứng dụng** / **Thêm vào màn hình chính**. iOS Safari: Share → **Thêm vào Màn hình chính**.

Health:
- Liveness: `GET /api/health`
- Readiness (DB): `GET /api/health/ready`

**Lưu ý:** `DEMO_MODE=true` bị **cấm** khi `NODE_ENV=production` (API không boot). Test nội bộ bỏ verify email → staging riêng hoặc tạm `NODE_ENV` không phải production (không khuyến nghị).

---

## E. Cloudflare R2 (ảnh public)

1. Cloudflare → R2 → Create bucket (vd. `langdaihoc-media`)
2. Settings bucket → **Public access** (r2.dev) hoặc gắn custom domain
3. Manage R2 API Tokens → Create API token (Object Read & Write, scope bucket)
4. Điền 5 biến `R2_*` trên Railway (xem mục C)
5. Object key: `{bucket}/{path}` — vd. `food-images/seller/abc.jpg`
6. URL: `{R2_PUBLIC_BASE_URL}/food-images/seller/abc.jpg`

Không cấu hình R2 → API fallback Supabase Storage (có warn trên production).  
`payment-proofs` **không** lên R2 (private signed URL trên Supabase).

---

## F. Resend (email Auth — verify / quên mật khẩu)

Supabase built-in SMTP ~2 mail/giờ — production cần Resend (SMTP).

1. [Resend](https://resend.com) → API Keys → Create (`re_…`)
2. Domains → Add `langdaihoc.com.vn` (hoặc subdomain `mail.`) → thêm DNS (SPF/DKIM) → Wait Verified  
   - Chưa có domain: tạm gửi từ `beth.t@example.com` **chỉ tới email đã verify trên Resend** (test nội bộ)
3. Supabase → Authentication → Emails → **SMTP Settings** → Enable Custom SMTP:

| Field | Value |
|-------|--------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key `re_…` |
| Sender email | `noreply@langdaihoc.com.vn` (domain verified) |
| Sender name | `Làng Đại Học` |

4. Authentication → **Rate Limits** — nâng email rate (mặc định custom SMTP ~30/h, nên ≥ 100–200/h khi mở bán)

Hoặc chạy (cần [Supabase access token](https://supabase.com/dashboard/account/tokens) + `RESEND_API_KEY`):

```bash
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
$env:RESEND_API_KEY="re_..."
$env:RESEND_FROM_EMAIL="noreply@langdaihoc.com.vn"
node scripts/setup-resend-smtp.mjs
```

---

## G. Smoke

Đăng ký / đăng nhập trên URL Vercel. Nếu session không giữ: kiểm tra `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `FRONTEND_URL` khớp.  
Upload ảnh món/feed → URL phải trỏ `R2_PUBLIC_BASE_URL` (khi đã set R2).  
Đăng ký user mới → nhận mail verify qua Resend (check Resend → Logs).

---

## Chi phí

Hobby + Railway + Supabase Free (+ R2 free + Resend free ~100 mail/ngày): thường khoảng **$0–15**/tháng tùy Railway.
