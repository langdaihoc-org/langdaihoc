/**
 * Reset trạng thái demo trước E2E / smoke — qua API local (không đụng SQL trực tiếp).
 * - Duyệt lại seller demo nếu bị suspended/rejected
 * - Kích hoạt lại user demo nếu bị suspended
 * - Xóa giỏ hàng buyer
 *
 * Yêu cầu: API đang chạy (http://localhost:3001).
 * Chạy: node scripts/reset-demo-state.mjs
 */
import { assertLocalDestructive } from './lib/assert-local.mjs';

const API = process.env.API_URL ?? 'http://localhost:3001';
process.env.API_URL = API;
assertLocalDestructive('reset-demo-state');

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo1234';

const DEMO_SELLER_EMAILS = new Set([
  'seller@demo.local',
  'food.seller2@demo.local',
  'laundry.seller3@demo.local',
  'ship.seller4@demo.local',
]);

const DEMO_USER_EMAILS = new Set([
  'buyer@hcmut.edu.vn',
  'admin@demo.local',
  ...DEMO_SELLER_EMAILS,
]);

async function req(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, setCookie };
}

function cookieFrom(setCookie) {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

async function login(email) {
  const r = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD, rememberMe: false },
  });
  if (!r.ok) throw new Error(`login ${email} → ${r.status} ${JSON.stringify(r.json)}`);
  return cookieFrom(r.setCookie);
}

async function main() {
  const health = await req('/api/health');
  if (!health.ok) {
    throw new Error(`API không sẵn sàng tại ${API}/api/health`);
  }

  const adminCookie = await login('admin@demo.local');
  const buyerCookie = await login('buyer@hcmut.edu.vn');

  let sellersFixed = 0;
  const sellers = await req('/api/admin/sellers', { cookie: adminCookie });
  if (!sellers.ok) throw new Error(`GET /admin/sellers → ${sellers.status}`);
  for (const row of sellers.json.data ?? []) {
    if (!DEMO_SELLER_EMAILS.has(row.email)) continue;
    if (row.seller?.status !== 'approved') {
      const patch = await req(`/api/admin/sellers/${row.seller.id}`, {
        method: 'PATCH',
        cookie: adminCookie,
        body: { status: 'approved' },
      });
      if (patch.ok) sellersFixed += 1;
      else console.warn(`  ! seller ${row.email}: ${patch.status} ${JSON.stringify(patch.json)}`);
    }
  }

  let usersFixed = 0;
  const users = await req('/api/admin/users', { cookie: adminCookie });
  if (!users.ok) throw new Error(`GET /admin/users → ${users.status}`);
  for (const u of users.json.data ?? []) {
    if (!DEMO_USER_EMAILS.has(u.email)) continue;
    if (u.status && u.status !== 'active') {
      const patch = await req(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        cookie: adminCookie,
        body: { status: 'active' },
      });
      if (patch.ok) usersFixed += 1;
      else console.warn(`  ! user ${u.email}: ${patch.status} ${JSON.stringify(patch.json)}`);
    }
  }

  const cart = await req('/api/cart', { method: 'DELETE', cookie: buyerCookie });
  const cartCleared = cart.ok || cart.status === 204;

  console.log(
    `[reset-demo] sellers→approved: ${sellersFixed}, users→active: ${usersFixed}, cart cleared: ${cartCleared}`,
  );
}

main().catch((err) => {
  console.error('[reset-demo] FAILED:', err.message);
  process.exit(1);
});
