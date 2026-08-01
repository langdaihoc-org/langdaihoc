/**
 * Comprehensive workflow + admin + data management smoke tests.
 * Usage: node scripts/smoke-full-audit.mjs
 */
import { assertLocalDestructive } from './lib/assert-local.mjs';

const API = process.env.API_URL ?? 'http://localhost:3001';
process.env.API_URL = API;
assertLocalDestructive('smoke-full-audit');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** 1x1 PNG */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
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
  return {
    status: res.status,
    json,
    ok: res.ok,
    cookie: setCookie.map((c) => c.split(';')[0]).join('; '),
  };
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

async function login(email, password = 'Demo1234') {
  const r = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password, rememberMe: false },
  });
  assert(r.ok, `login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  assert(r.cookie, 'no cookie');
  return { cookie: r.cookie, user: r.json.user };
}

function requiredOptions(item) {
  return (item.optionGroups ?? [])
    .filter((g) => g.required || (g.minSelect ?? 0) > 0)
    .map((g) => g.options?.[0])
    .filter(Boolean)
    .map((o) => ({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) || 0 }));
}

async function patchStatus(cookie, orderId, status) {
  const r = await req(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    cookie,
    body: { status },
  });
  assert(r.ok, `${status}: ${r.status} ${JSON.stringify(r.json)}`);
  assert(r.json.data?.status === status, `got ${r.json.data?.status}`);
  return r.json.data;
}

async function main() {
  console.log(`\n🔎 Full audit → ${API}\n`);

  // ── Bootstrap / repair demo data ───────────────────────
  console.log('— Bootstrap demo partners —');
  const admin = await login('admin@demo.local');
  const sellers = (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? [];
  for (const row of sellers) {
    if (row.seller.status !== 'approved') {
      await req(`/api/admin/sellers/${row.seller.id}`, {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { status: 'approved' },
      });
      console.log(`  repaired seller → approved: ${row.seller.shopName}`);
    }
  }
  for (const u of (await req('/api/admin/users?status=suspended', { cookie: admin.cookie })).json.data ?? []) {
    await req(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'active' },
    });
    console.log(`  repaired user → active: ${u.email}`);
  }

  const buyer = await login('buyer@hcmut.edu.vn');
  const sellerFood = await login('seller@demo.local');
  const sellerLaundry = await login('laundry.seller3@demo.local');
  const sellerShip = await login('ship.seller4@demo.local');

  // Ensure feed has a post
  const postsBefore = (await req('/api/catalog/posts')).json.data ?? [];
  if (postsBefore.length === 0) {
    const created = await req('/api/seller/posts', {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: { title: 'Audit feed post', body: 'Nội dung kiểm tra' },
    });
    assert(created.ok, `create post ${created.status} ${JSON.stringify(created.json)}`);
  }

  // Ensure buyer address with dorm handoff
  let addresses = (await req('/api/buyer/addresses', { cookie: buyer.cookie })).json.data ?? [];
  let address = addresses[0];
  if (!address) {
    const created = await req('/api/buyer/addresses', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        recipientName: 'Audit Buyer',
        phone: '0901234567',
        detail: 'KTX khu A',
        dormName: 'KTX A',
        roomNumber: 'toa',
        addressType: 'dorm',
        isDefault: true,
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    address = created.json.data;
  } else if (address.dormName && address.roomNumber && !['toa', 'rao'].includes(address.roomNumber)) {
    const updated = await req(`/api/buyer/addresses/${address.id}`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { roomNumber: 'toa' },
    });
    address = updated.json.data ?? address;
  }

  // ── Catalog ────────────────────────────────────────────
  console.log('\n— Catalog —');
  await test('feed posts ≥1', async () => {
    const r = await req('/api/catalog/posts');
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, JSON.stringify(r.json));
  });
  await test('food catalog ≥1', async () => {
    const r = await req('/api/catalog/food');
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, 'empty food');
  });
  await test('laundry catalog ≥1', async () => {
    const r = await req('/api/catalog/laundry');
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, 'empty laundry');
  });
  await test('ship sellers ≥1', async () => {
    const r = await req('/api/catalog/sellers?serviceType=ship_proxy');
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, 'no ship sellers');
  });

  // ── Dorm handoff address ───────────────────────────────
  console.log('\n— Địa chỉ KTX (tòa/rào) —');
  await test('create address giao tại rào', async () => {
    const r = await req('/api/buyer/addresses', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        recipientName: 'Handoff Rao',
        phone: '0909999888',
        detail: 'Cổng KTX B',
        dormName: 'KTX B',
        roomNumber: 'rao',
        addressType: 'dorm',
      },
    });
    assert(r.ok, JSON.stringify(r.json));
    assert(r.json.data.roomNumber === 'rao', `got ${r.json.data.roomNumber}`);
  });

  // ── Food full lifecycle ────────────────────────────────
  console.log('\n— Food workflow —');
  const food = (await req('/api/catalog/food')).json.data ?? [];
  const foodItem = food.find((f) => f.sellerId === sellers.find((s) => s.email === 'seller@demo.local')?.seller.id) ?? food[0];

  await test('cart IDOR: foreign delete → 404', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    const add = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    assert(add.ok, JSON.stringify(add.json));
    const itemId = add.json.data.items[0].id;
    // seller acting as non-owner of buyer cart — if DEMO off, seller gets 403; if can access cart, 404
    const del = await req(`/api/cart/items/${itemId}`, { method: 'DELETE', cookie: sellerFood.cookie });
    assert(del.status === 404 || del.status === 403, `expected 404/403 got ${del.status}`);
    const still = await req('/api/cart', { cookie: buyer.cookie });
    assert((still.json.data?.items?.length ?? 0) >= 1, 'cart wiped by foreign delete');
  });

  await test('option price from DB (ignore client priceDelta)', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    const withOpt = food.find((f) => (f.optionGroups ?? []).some((g) => g.options?.length)) ?? foodItem;
    const opts = (withOpt.optionGroups ?? []).flatMap((g) =>
      g.options?.[0] ? [{ id: g.options[0].id, name: 'hack', priceDelta: -999999 }] : [],
    );
    const add = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: withOpt.id, quantity: 1, forceClear: true, options: opts.length ? opts : requiredOptions(withOpt) },
    });
    assert(add.ok, JSON.stringify(add.json));
    const stored = add.json.data.items[0].optionsJson ?? [];
    for (const o of stored) {
      assert(o.priceDelta !== -999999, `client price accepted: ${JSON.stringify(stored)}`);
    }
  });

  let foodOrderId;
  await test('food checkout → accept → prepare → deliver → complete', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const checkout = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: address.phone || '0901234567',
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(checkout.ok, JSON.stringify(checkout.json));
    foodOrderId = checkout.json.data.id;
    await patchStatus(sellerFood.cookie, foodOrderId, 'accepted');
    await patchStatus(sellerFood.cookie, foodOrderId, 'preparing');
    await patchStatus(sellerFood.cookie, foodOrderId, 'delivering');
    await patchStatus(buyer.cookie, foodOrderId, 'completed');
  });

  await test('food: foreign seller cannot accept another shop order', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const checkout = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    const oid = checkout.json.data.id;
    const r = await req(`/api/orders/${oid}/status`, {
      method: 'PATCH',
      cookie: sellerLaundry.cookie,
      body: { status: 'accepted' },
    });
    assert(r.status === 403, `expected 403 got ${r.status} ${JSON.stringify(r.json)}`);
    await patchStatus(sellerFood.cookie, oid, 'rejected');
  });

  // ── Laundry full lifecycle ─────────────────────────────
  console.log('\n— Laundry workflow —');
  const laundry = (await req('/api/catalog/laundry')).json.data ?? [];
  const service = laundry[0];

  await test('laundry create → pick → quote → confirm → return → complete', async () => {
    assert(service?.id, 'no laundry service');
    const pickupAt = new Date(Date.now() + 3600_000).toISOString();
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 2,
        pickupScheduledAt: pickupAt,
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, oid, 'accepted');
    await patchStatus(sellerLaundry.cookie, oid, 'picking_up');
    await patchStatus(sellerLaundry.cookie, oid, 'picked_up');
    const quote = await req(`/api/orders/${oid}/laundry-quote`, {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { actualQty: 2.5, unitPrice: Number(service.basePrice) || 15000, surcharge: 0, sellerNote: 'audit' },
    });
    assert(quote.ok, JSON.stringify(quote.json));
    assert(quote.json.data?.status === 'waiting_price_confirmation', quote.json.data?.status);
    const confirm = await req(`/api/orders/${oid}/confirm-price`, {
      method: 'POST',
      cookie: buyer.cookie,
    });
    assert(confirm.ok, JSON.stringify(confirm.json));
    assert(confirm.json.data?.status === 'washing', confirm.json.data?.status);
    await patchStatus(sellerLaundry.cookie, oid, 'returning');
    await patchStatus(buyer.cookie, oid, 'completed');
  });

  await test('laundry reject-price → cancelled', async () => {
    const pickupAt = new Date(Date.now() + 3600_000).toISOString();
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 1,
        pickupScheduledAt: pickupAt,
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const oid = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, oid, 'accepted');
    await patchStatus(sellerLaundry.cookie, oid, 'picking_up');
    await patchStatus(sellerLaundry.cookie, oid, 'picked_up');
    await req(`/api/orders/${oid}/laundry-quote`, {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { actualQty: 3, unitPrice: Number(service.basePrice) || 15000, surcharge: 10000 },
    });
    const reject = await req(`/api/orders/${oid}/reject-price`, {
      method: 'POST',
      cookie: buyer.cookie,
    });
    assert(reject.ok, JSON.stringify(reject.json));
    assert(reject.json.data?.status === 'cancelled', reject.json.data?.status);
  });

  await test('laundry: food seller cannot quote', async () => {
    const pickupAt = new Date(Date.now() + 3600_000).toISOString();
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 1,
        pickupScheduledAt: pickupAt,
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const oid = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, oid, 'accepted');
    await patchStatus(sellerLaundry.cookie, oid, 'picking_up');
    await patchStatus(sellerLaundry.cookie, oid, 'picked_up');
    const bad = await req(`/api/orders/${oid}/laundry-quote`, {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: { actualQty: 1, unitPrice: 15000 },
    });
    assert(bad.status === 403, `expected 403 got ${bad.status}`);
    // cleanup: owner quotes then buyer reject
    await req(`/api/orders/${oid}/laundry-quote`, {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { actualQty: 1, unitPrice: Number(service.basePrice) || 15000 },
    });
    await req(`/api/orders/${oid}/reject-price`, { method: 'POST', cookie: buyer.cookie });
  });

  // ── Ship proxy ─────────────────────────────────────────
  console.log('\n— Ship proxy workflow —');
  const shipSeller = (await req('/api/catalog/sellers?serviceType=ship_proxy')).json.data?.[0];

  await test('ship create → accept → pay → complete', async () => {
    assert(shipSeller?.id, 'no ship seller');
    const created = await req('/api/orders/ship-proxy', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        sellerId: shipSeller.id,
        trackingCode: 'SPX-AUDIT-1',
        pickupLocation: 'Bưu cục KTX B',
        pickupAt: new Date(Date.now() + 3600_000).toISOString(),
        receivePhone: '0901111222',
        returnAt: new Date(Date.now() + 7200_000).toISOString(),
        returnAddressText: 'KTX B · Giao tại tòa',
          packageValue: 150000,
        contactPhone: '0901234567',
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;
    await patchStatus(sellerShip.cookie, oid, 'accepted');
    const blocked = await req(`/api/orders/${oid}/status`, {
      method: 'PATCH',
      cookie: sellerShip.cookie,
      body: { status: 'preparing' },
    });
    assert(blocked.status === 409, `expected payment gate got ${blocked.status}`);
    const upload = await req('/api/buyer/upload', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        bucket: 'payment-proofs',
        contentType: 'image/png',
        dataBase64: TINY_PNG_B64,
        fileName: 'ship-audit',
      },
    });
    assert(upload.ok && upload.json.data?.url, JSON.stringify(upload.json));
    await req(`/api/orders/${oid}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { imageUrl: upload.json.data.url },
    });
    await req(`/api/orders/${oid}/verify-payment`, {
      method: 'POST',
      cookie: sellerShip.cookie,
      body: { approved: true },
    });
    await patchStatus(sellerShip.cookie, oid, 'preparing');
    await patchStatus(sellerShip.cookie, oid, 'picked_up');
    await patchStatus(sellerShip.cookie, oid, 'delivering');
    await patchStatus(buyer.cookie, oid, 'completed');
  });

  // ── Admin quản trị ─────────────────────────────────────
  console.log('\n— Admin quản trị —');
  await test('admin stats', async () => {
    const r = await req('/api/admin/stats', { cookie: admin.cookie });
    assert(r.ok && typeof r.json.data?.buyers === 'number', JSON.stringify(r.json));
  });

  await test('admin list users + filter seller', async () => {
    const r = await req('/api/admin/users?role=seller', { cookie: admin.cookie });
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, JSON.stringify(r.json));
  });

  await test('admin suspend + reactivate partner', async () => {
    const foodRow = sellers.find((s) => s.email === 'food.seller2@demo.local') ?? sellers.find((s) => s.seller.serviceTypes === 'food' && s.email !== 'seller@demo.local');
    assert(foodRow, 'need secondary food seller');
    const sus = await req(`/api/admin/sellers/${foodRow.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'suspended' },
    });
    assert(sus.ok && sus.json.data.status === 'suspended', JSON.stringify(sus.json));
    const act = await req(`/api/admin/sellers/${foodRow.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'approved' },
    });
    assert(act.ok && act.json.data.status === 'approved', JSON.stringify(act.json));
  });

  await test('admin cannot delete seller with orders', async () => {
    const foodMain = sellers.find((s) => s.email === 'seller@demo.local');
    assert(foodMain, 'no main food seller');
    const del = await req(`/api/admin/sellers/${foodMain.seller.id}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.status === 409 && del.json.error?.code === 'SELLER_HAS_ORDERS', JSON.stringify(del.json));
  });

  await test('admin cannot delete buyer with orders', async () => {
    const del = await req(`/api/admin/users/${buyer.user.id}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.status === 409 && del.json.error?.code === 'USER_HAS_ORDERS', JSON.stringify(del.json));
  });

  await test('admin create/delete banner', async () => {
    const created = await req('/api/admin/banners', {
      method: 'POST',
      cookie: admin.cookie,
      body: { title: 'Audit banner', isActive: true, sortOrder: 99 },
    });
    assert(created.ok, JSON.stringify(created.json));
    const id = created.json.data.id;
    const del = await req(`/api/admin/banners/${id}`, { method: 'DELETE', cookie: admin.cookie });
    assert(del.ok || del.status === 200, JSON.stringify(del.json));
  });

  await test('admin create/delete post', async () => {
    const created = await req('/api/admin/posts', {
      method: 'POST',
      cookie: admin.cookie,
      body: { title: 'Admin audit post', body: 'x', status: 'published' },
    });
    assert(created.ok, JSON.stringify(created.json));
    const del = await req(`/api/admin/posts/${created.json.data.id}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.ok || del.status === 200, JSON.stringify(del.json));
  });

  await test('admin categories list', async () => {
    const r = await req('/api/admin/categories', { cookie: admin.cookie });
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, JSON.stringify(r.json));
  });

  await test('admin audit logs readable', async () => {
    const r = await req('/api/admin/audit-logs', { cookie: admin.cookie });
    assert(r.ok && Array.isArray(r.json.data), JSON.stringify(r.json));
  });

  await test('buyer cannot access admin', async () => {
    const r = await req('/api/admin/stats', { cookie: buyer.cookie });
    assert(r.status === 403, `got ${r.status}`);
  });

  // ── Notifications ──────────────────────────────────────
  console.log('\n— Thông báo —');
  await test('buyer notifications list + mark all read', async () => {
    const list = await req('/api/buyer/notifications', { cookie: buyer.cookie });
    assert(list.ok && Array.isArray(list.json.data), JSON.stringify(list.json));
    const read = await req('/api/buyer/notifications/read-all', {
      method: 'PATCH',
      cookie: buyer.cookie,
    });
    assert(read.ok, JSON.stringify(read.json));
  });

  // ── Data retention (logic unit) ─────────────────────────
  console.log('\n— Quản lý dữ liệu (retention) —');
  await test('retention: thông báo 7n / idempotency 3n / audit 30n / biên lai theo đơn', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../apps/api/src/jobs/data-retention.ts', import.meta.url), 'utf8');
    assert(/NOTIFICATIONS_DAYS\s*=\s*7/.test(src), 'NOTIFICATIONS_DAYS is not 7');
    assert(/IDEMPOTENCY_DAYS\s*=\s*3/.test(src), 'IDEMPOTENCY_DAYS is not 3');
    assert(/AUDIT_DAYS\s*=\s*30/.test(src), 'AUDIT_DAYS is not 30');
    assert(/paymentProofs/.test(src), 'retention must purge paymentProofs');
    assert(/scheduleDailyAtMidnight/.test(src), 'retention not scheduled at midnight');
  });

  await test('notification retention covered by data-retention', async () => {
    const fs = await import('node:fs/promises');
    const retention = await fs.readFile(new URL('../apps/api/src/jobs/data-retention.ts', import.meta.url), 'utf8');
    assert(/delete\(notifications\)/.test(retention), 'retention must purge notifications');
    const compat = await fs.readFile(new URL('../apps/api/src/jobs/notification-daily-reset.ts', import.meta.url), 'utf8');
    assert(/purgeAllNotifications|runDataRetention/.test(compat), 'compat export missing');
  });

  console.log(`\n——— Kết quả: ${passed} passed, ${failed} failed ———\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
