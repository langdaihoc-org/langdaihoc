/**
 * Smoke test toàn bộ workflow chính trên API local.
 * Usage: node scripts/smoke-all.mjs
 */
import { assertLocalDestructive } from './lib/assert-local.mjs';

const API = process.env.API_URL ?? 'http://localhost:3001';
process.env.API_URL = API;
assertLocalDestructive('smoke-all');

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const skips = [];

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
  return { status: res.status, json, setCookie, ok: res.ok };
}

function extractCookie(setCookie) {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
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

function skip(name, reason) {
  skipped += 1;
  skips.push({ name, reason });
  console.log(`  ○ ${name}: SKIP — ${reason}`);
}

async function login(email, password = 'Demo1234') {
  const r = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password, rememberMe: false },
  });
  assert(r.ok, `login ${email} failed: ${r.status} ${JSON.stringify(r.json)}`);
  const cookie = extractCookie(r.setCookie);
  assert(cookie, 'no session cookie');
  return { cookie, user: r.json.user };
}

function requiredOptions(item) {
  return (item.optionGroups ?? [])
    .filter((g) => g.required || (g.minSelect ?? 0) > 0)
    .map((g) => g.options?.[0])
    .filter(Boolean)
    .map((o) => ({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) || 0 }));
}

async function ensureAddress(cookie) {
  const list = await req('/api/buyer/addresses', { cookie });
  if ((list.json.data ?? []).length > 0) return list.json.data[0];
  const created = await req('/api/buyer/addresses', {
    method: 'POST',
    cookie,
    body: {
      recipientName: 'Smoke Buyer',
      phone: '0901234567',
      detail: 'KTX Khu A, phòng A1-101',
      addressType: 'dorm',
      isDefault: true,
    },
  });
  assert(created.ok, `create address ${created.status} ${JSON.stringify(created.json)}`);
  return created.json.data;
}

async function findSellerCookieForOrder(orderId, cookies) {
  for (const c of cookies) {
    const r = await req(`/api/orders/${orderId}`, { cookie: c });
    if (r.status === 200) return c;
  }
  return null;
}

async function patchStatus(cookie, orderId, status, note) {
  const r = await req(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    cookie,
    body: { status, note },
  });
  assert(r.ok, `${status} failed ${r.status} ${JSON.stringify(r.json)}`);
  assert(r.json.data?.status === status, `expected ${status}, got ${r.json.data?.status}`);
  return r.json.data;
}

async function main() {
  console.log(`\n🧪 Smoke all workflows → ${API}\n`);

  // ── Health ──────────────────────────────────────────────
  console.log('— Health —');
  await test('API health', async () => {
    const r = await req('/api/health');
    assert(r.ok && r.json.status === 'ok', JSON.stringify(r.json));
  });

  // ── Catalog (guest) ─────────────────────────────────────
  console.log('\n— Catalog (guest) —');
  let posts = [];
  let food = [];
  let laundry = [];
  let foodSellers = [];
  let laundrySellers = [];
  let shipSellers = [];

  await test('banners strip', async () => {
    const r = await req('/api/catalog/banners?popup=0');
    assert(r.ok && Array.isArray(r.json.data), `status ${r.status}`);
  });

  await test('banners popup', async () => {
    const r = await req('/api/catalog/banners?popup=1');
    assert(r.ok && Array.isArray(r.json.data), `status ${r.status}`);
  });

  await test('feed posts', async () => {
    const r = await req('/api/catalog/posts');
    assert(r.ok, `status ${r.status}`);
    posts = r.json.data ?? [];
    assert(posts.length >= 1, 'expected ≥1 post');
  });

  await test('post detail', async () => {
    const id = posts[0]?.id;
    assert(id, 'no post');
    const r = await req(`/api/catalog/posts/${id}`);
    assert(r.ok && r.json.data?.id === id, `status ${r.status}`);
  });

  await test('food catalog', async () => {
    const r = await req('/api/catalog/food');
    assert(r.ok, `status ${r.status}`);
    food = r.json.data ?? [];
    assert(food.length >= 1, 'no food items');
  });

  await test('laundry catalog', async () => {
    const r = await req('/api/catalog/laundry');
    assert(r.ok, `status ${r.status}`);
    laundry = r.json.data ?? [];
    assert(laundry.length >= 1, 'no laundry services');
  });

  await test('sellers by service type', async () => {
    foodSellers = (await req('/api/catalog/sellers?serviceType=food')).json.data ?? [];
    laundrySellers = (await req('/api/catalog/sellers?serviceType=laundry')).json.data ?? [];
    shipSellers = (await req('/api/catalog/sellers?serviceType=ship_proxy')).json.data ?? [];
    assert(foodSellers.length >= 1, 'no food sellers');
    assert(laundrySellers.length >= 1, 'no laundry sellers');
  });

  await test('categories', async () => {
    const r = await req('/api/catalog/categories?type=food');
    assert(r.ok && (r.json.data?.length ?? 0) >= 1, 'no categories');
  });

  // ── Auth ────────────────────────────────────────────────
  console.log('\n— Auth —');
  let buyer;
  let sellerFood;
  let sellerLaundry;
  let sellerShip;
  let admin;

  await test('login buyer', async () => {
    buyer = await login('buyer@hcmut.edu.vn');
    assert(buyer.user.role === 'buyer', `role=${buyer.user.role}`);
  });
  await test('login food seller', async () => {
    sellerFood = await login('seller@demo.local');
    assert(sellerFood.user.role === 'seller', `role=${sellerFood.user.role}`);
  });
  await test('login laundry seller', async () => {
    sellerLaundry = await login('laundry.seller3@demo.local');
    assert(sellerLaundry.user.role === 'seller', `role=${sellerLaundry.user.role}`);
  });
  await test('login ship seller (optional)', async () => {
    try {
      sellerShip = await login('ship.seller4@demo.local');
      assert(sellerShip.user.role === 'seller', `role=${sellerShip.user.role}`);
    } catch (e) {
      skip('login ship seller', e.message);
      sellerShip = null;
    }
  });
  await test('login admin', async () => {
    admin = await login('admin@demo.local');
    assert(admin.user.role === 'admin', `role=${admin.user.role}`);
  });
  await test('auth /me', async () => {
    const r = await req('/api/auth/me', { cookie: buyer.cookie });
    assert(r.ok && r.json.user?.email === 'buyer@hcmut.edu.vn', JSON.stringify(r.json));
  });
  await test('buyer profile update (name/phone) + /me reflects', async () => {
    const me = await req('/api/auth/me', { cookie: buyer.cookie });
    const original = { fullName: me.json.user.fullName, phone: me.json.user.phone ?? null };

    const newName = `Sinh viên Smoke ${Date.now() % 1000}`;
    const patch = await req('/api/buyer/profile', {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { fullName: newName, phone: original.phone, email: me.json.user.email },
    });
    assert(patch.ok && patch.json.data?.fullName === newName, JSON.stringify(patch.json));
    assert(patch.json.emailChanged === false, `emailChanged=${patch.json.emailChanged}`);

    const after = await req('/api/auth/me', { cookie: buyer.cookie });
    assert(after.json.user?.fullName === newName, `me not updated: ${after.json.user?.fullName}`);
    assert(after.json.user?.status === 'active', `status=${after.json.user?.status}`);

    // khôi phục để không ảnh hưởng test sau
    const restore = await req('/api/buyer/profile', {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: original,
    });
    assert(restore.ok, JSON.stringify(restore.json));
  });
  await test('buyer profile rejects duplicate phone', async () => {
    // Phone của food seller trong seed — buyer không thể chiếm
    const sellerMe = await req('/api/auth/me', { cookie: sellerFood.cookie });
    const sellerPhone = sellerMe.json.user?.phone;
    if (!sellerPhone) {
      skip('duplicate phone', 'seller không có phone trong seed');
      return;
    }
    const r = await req('/api/buyer/profile', {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { phone: sellerPhone },
    });
    assert(r.status === 409 && r.json.error?.code === 'PHONE_EXISTS', JSON.stringify(r.json));
  });

  const address = await ensureAddress(buyer.cookie);
  const sellerCookies = [
    sellerFood.cookie,
    sellerLaundry.cookie,
    ...(sellerShip ? [sellerShip.cookie] : []),
  ];

  // ── Food: cart → checkout → lifecycle → review ──────────
  console.log('\n— Food order lifecycle —');
  let foodOrderId;

  await test('clear cart', async () => {
    const r = await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    assert(r.ok || r.status === 204, `status ${r.status}`);
  });

  await test('add to cart with options', async () => {
    // Prefer item of main food seller so seller@demo can process it
    const item =
      food.find((f) => f.shopName?.includes('Cơm') || f.sellerId === foodSellers[0]?.id) ?? food[0];
    assert(item?.id, 'no food item');
    // Ensure available
    await req(`/api/seller/food-items/${item.id}`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { isAvailable: true },
    });
    const r = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        foodItemId: item.id,
        quantity: 1,
        forceClear: true,
        options: requiredOptions(item),
      },
    });
    assert(r.ok, `status ${r.status} ${JSON.stringify(r.json)}`);
    assert((r.json.data?.items?.length ?? 0) >= 1, 'cart empty after add');
  });

  await test('checkout food (cash)', async () => {
    const r = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: address.phone || '0901234567',
        paymentMethod: 'cash',
        notes: 'smoke food cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(r.ok, `checkout ${r.status} ${JSON.stringify(r.json)}`);
    foodOrderId = r.json.data?.id;
    assert(foodOrderId && r.json.data.status === 'pending', JSON.stringify(r.json.data));
  });

  await test('checkout rejects missing idempotency key', async () => {
    const r = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    assert(r.status === 400 && r.json.error?.code === 'IDEMPOTENCY_KEY_REQUIRED', JSON.stringify(r.json));
  });

  await test('food: seller accept → prepare → deliver', async () => {
    const sc = await findSellerCookieForOrder(foodOrderId, sellerCookies);
    assert(sc, 'no owning seller for food order');
    await patchStatus(sc, foodOrderId, 'accepted');
    await patchStatus(sc, foodOrderId, 'preparing');
    await patchStatus(sc, foodOrderId, 'delivering');
  });

  await test('food: buyer cannot self-accept', async () => {
    // create another pending via fresh cart
    const item = food[0];
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: item.id, quantity: 1, forceClear: true, options: requiredOptions(item) },
    });
    const created = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(created.ok, `create ${created.status}`);
    const id = created.json.data.id;
    const r = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { status: 'accepted' },
    });
    assert(r.status === 403 || r.status === 409, `expected forbid, got ${r.status}`);
    // cancel as buyer while pending
    await patchStatus(buyer.cookie, id, 'cancelled', 'buyer cancel smoke');
  });

  await test('food: buyer complete + review', async () => {
    await patchStatus(buyer.cookie, foodOrderId, 'completed');
    const review = await req(`/api/orders/${foodOrderId}/review`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { rating: 5, comment: 'Smoke review OK', tags: ['ngon'] },
    });
    assert(review.ok || review.status === 201, `review ${review.status} ${JSON.stringify(review.json)}`);
  });

  await test('food: seller mark-paid (cash)', async () => {
    // New cash order just to mark paid mid-flow — khớp seller demo đã login
    const item =
      food.find((f) => f.sellerId === foodSellers[0]?.id) ??
      food.find((f) => f.shopName?.includes('Cơm')) ??
      food[0];
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: item.id, quantity: 1, forceClear: true, options: requiredOptions(item) },
    });
    const created = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(created.ok, `create ${created.status}`);
    const id = created.json.data.id;
    const sc = await findSellerCookieForOrder(id, sellerCookies);
    assert(sc, 'no seller session for mark-paid order');
    const paid = await req(`/api/orders/${id}/mark-paid`, { method: 'POST', cookie: sc });
    assert(paid.ok, `mark-paid ${paid.status} ${JSON.stringify(paid.json)}`);
    // Huỷ khi còn pending (buyer); không accept rồi mới cancel
    await patchStatus(buyer.cookie, id, 'cancelled', 'cleanup after mark-paid');
  });

  // ── Food bank transfer + bank-info ───────────────────────
  console.log('\n— Food bank transfer —');
  let bankOrderId;
  await test('checkout food (bank_transfer)', async () => {
    const item =
      food.find((f) => f.sellerId === foodSellers[0]?.id) ??
      food.find((f) => f.shopName?.includes('Cơm')) ??
      food[0];
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: item.id, quantity: 1, forceClear: true, options: requiredOptions(item) },
    });
    const r = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'bank_transfer',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(r.ok, `checkout ${r.status} ${JSON.stringify(r.json)}`);
    bankOrderId = r.json.data.id;
    assert(r.json.data.paymentMethod === 'bank_transfer', 'payment method mismatch');
  });

  await test('buyer can read bank-info of own order seller', async () => {
    const detail = await req(`/api/orders/${bankOrderId}`, { cookie: buyer.cookie });
    const sellerId = detail.json.data?.order?.sellerId ?? detail.json.data?.sellerId;
    assert(sellerId, 'no sellerId');
    const r = await req(`/api/orders/bank-info/${sellerId}`, { cookie: buyer.cookie });
    assert(r.ok, `bank-info ${r.status} ${JSON.stringify(r.json)}`);
  });

  await test('foreign seller cannot read bank-info', async () => {
    const detail = await req(`/api/orders/${bankOrderId}`, { cookie: buyer.cookie });
    const sellerId = detail.json.data?.order?.sellerId;
    // Use the other seller cookie
    const sc = await findSellerCookieForOrder(bankOrderId, sellerCookies);
    const other = sellerCookies.find((c) => c !== sc);
    if (!other) {
      skip('foreign seller cannot read bank-info', 'chỉ có 1 seller cookie');
      return;
    }
    const r = await req(`/api/orders/bank-info/${sellerId}`, { cookie: other });
    assert(r.status === 403, `expected 403 got ${r.status}`);
  });

  await test('payment-proof rejects non-uploaded URL', async () => {
    const r = await req(`/api/orders/${bankOrderId}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { imageUrl: 'https://evil.example.com/fake.png' },
    });
    assert(r.status === 400 || r.status === 403, `expected reject got ${r.status} ${JSON.stringify(r.json)}`);
  });

  await test('foreign seller cannot verify-payment / mark-paid', async () => {
    const sc = await findSellerCookieForOrder(bankOrderId, sellerCookies);
    const other = sellerCookies.find((c) => c !== sc) ?? sellerLaundry.cookie;
    const v = await req(`/api/orders/${bankOrderId}/verify-payment`, {
      method: 'POST',
      cookie: other,
      body: { approved: true },
    });
    assert(v.status === 403, `verify got ${v.status}`);
    const m = await req(`/api/orders/${bankOrderId}/mark-paid`, {
      method: 'POST',
      cookie: other,
    });
    assert(m.status === 403, `mark-paid got ${m.status}`);
  });

  await test('cleanup bank order (seller reject)', async () => {
    const sc = await findSellerCookieForOrder(bankOrderId, sellerCookies);
    await patchStatus(sc, bankOrderId, 'rejected', 'smoke cleanup');
  });

  // ── Laundry full lifecycle ──────────────────────────────
  console.log('\n— Laundry order lifecycle —');
  let laundryOrderId;

  await test('create laundry order', async () => {
    const service = laundry[0];
    assert(service?.id, 'no laundry service');
    const r = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 3,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
        notes: 'smoke laundry',
      },
    });
    assert(r.ok, `create ${r.status} ${JSON.stringify(r.json)}`);
    laundryOrderId = r.json.data.id;
    assert(r.json.data.status === 'pending', `status=${r.json.data.status}`);
  });

  await test('laundry: accept → pick → quote → confirm → return → complete', async () => {
    const sc = await findSellerCookieForOrder(laundryOrderId, sellerCookies);
    assert(sc, 'no laundry seller');
    await patchStatus(sc, laundryOrderId, 'accepted');
    await patchStatus(sc, laundryOrderId, 'picking_up');
    await patchStatus(sc, laundryOrderId, 'picked_up');

    const quote = await req(`/api/orders/${laundryOrderId}/laundry-quote`, {
      method: 'POST',
      cookie: sc,
      body: { actualQty: 3.5, unitPrice: 15000, surcharge: 5000, sellerNote: 'vết bẩn' },
    });
    assert(quote.ok && quote.json.data?.status === 'waiting_price_confirmation', JSON.stringify(quote.json));

    const detail = await req(`/api/orders/${laundryOrderId}`, { cookie: buyer.cookie });
    const finalPrice = Number(detail.json.data?.laundry?.finalPrice);
    assert(finalPrice === 3.5 * 15000 + 5000, `finalPrice=${finalPrice}`);

    const confirm = await req(`/api/orders/${laundryOrderId}/confirm-price`, {
      method: 'POST',
      cookie: buyer.cookie,
    });
    assert(confirm.ok && confirm.json.data?.status === 'washing', JSON.stringify(confirm.json));

    await patchStatus(sc, laundryOrderId, 'returning');
    await patchStatus(sc, laundryOrderId, 'completed');
  });

  await test('laundry: reject-price cancels order', async () => {
    const service = laundry[0];
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 2,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    assert(created.ok, `create ${created.status}`);
    const id = created.json.data.id;
    const sc = await findSellerCookieForOrder(id, sellerCookies);
    await patchStatus(sc, id, 'accepted');
    await patchStatus(sc, id, 'picking_up');
    await patchStatus(sc, id, 'picked_up');
    await req(`/api/orders/${id}/laundry-quote`, {
      method: 'POST',
      cookie: sc,
      body: { actualQty: 10, unitPrice: 50000 },
    });
    const reject = await req(`/api/orders/${id}/reject-price`, {
      method: 'POST',
      cookie: buyer.cookie,
    });
    assert(reject.ok && reject.json.data?.status === 'cancelled', JSON.stringify(reject.json));
  });

  await test('laundry: foreign seller cannot quote', async () => {
    const service = laundry[0];
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: service.id,
        estimatedQty: 1,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const id = created.json.data.id;
    const sc = await findSellerCookieForOrder(id, sellerCookies);
    await patchStatus(sc, id, 'accepted');
    await patchStatus(sc, id, 'picking_up');
    await patchStatus(sc, id, 'picked_up');
    const other = sellerCookies.find((c) => c !== sc);
    assert(other, 'need second seller');
    const r = await req(`/api/orders/${id}/laundry-quote`, {
      method: 'POST',
      cookie: other,
      body: { actualQty: 1, unitPrice: 1000 },
    });
    assert(r.status === 403, `expected 403 got ${r.status}`);
    // Cleanup: báo giá rồi buyer từ chối để đóng đơn
    await req(`/api/orders/${id}/laundry-quote`, {
      method: 'POST',
      cookie: sc,
      body: { actualQty: 1, unitPrice: 1000 },
    });
    const reject = await req(`/api/orders/${id}/reject-price`, {
      method: 'POST',
      cookie: buyer.cookie,
    });
    assert(reject.ok && reject.json.data?.status === 'cancelled', `cleanup ${reject.status}`);
  });

  // ── Ship proxy ──────────────────────────────────────────
  console.log('\n— Ship proxy —');
  if (shipSellers.length === 0) {
    skip('ship-proxy create + lifecycle', 'seed không có seller serviceTypes=ship_proxy');
    await test('ship-proxy create returns 404 when no seller', async () => {
      const r = await req('/api/orders/ship-proxy', {
        method: 'POST',
        cookie: buyer.cookie,
        body: {
          sellerId: foodSellers[0]?.id ?? crypto.randomUUID(),
          trackingCode: 'SPX123',
          pickupLocation: 'Bưu cục KTX A',
          pickupAt: new Date(Date.now() + 3600000).toISOString(),
          receivePhone: '0901111222',
          price: 20000,
          returnAt: new Date(Date.now() + 7200000).toISOString(),
          returnAddressText: 'KTX A phòng 101',
          packageValue: 150000,
          contactPhone: '0901234567',
          paymentMethod: 'cash',
        },
      });
      assert(r.status === 404 || r.status === 400, `expected 404/400 got ${r.status} ${JSON.stringify(r.json)}`);
    });
  } else {
    await test('ship-proxy full lifecycle', async () => {
      let sellerId = shipSellers.find((s) => s.shopName?.includes('Nhận Ship Hộ'))?.id ?? shipSellers[0].id;
      let sc = sellerShip?.cookie ?? null;
      if (sellerShip?.cookie) {
        const shop = await req('/api/seller/shop', { cookie: sellerShip.cookie });
        if (shop.ok && shop.json.data?.id) {
          sellerId = shop.json.data.id;
          sc = sellerShip.cookie;
        }
      }
      const created = await req('/api/orders/ship-proxy', {
        method: 'POST',
        cookie: buyer.cookie,
        body: {
          sellerId,
          trackingCode: `SMOKE-${Date.now()}`,
          pickupLocation: 'Bưu cục KTX A',
          pickupAt: new Date(Date.now() + 3600000).toISOString(),
          receivePhone: '0901111222',
          returnAt: new Date(Date.now() + 5 * 86400000).toISOString(),
          returnAddressText: 'KTX A phòng 101',
          packageValue: 150000,
          contactPhone: '0901234567',
        },
      });
      assert(created.ok, `create ${created.status} ${JSON.stringify(created.json)}`);
      assert(created.json.data.paymentMethod === 'bank_transfer', 'ship must be bank_transfer');
      const id = created.json.data.id;
      if (!sc) sc = await findSellerCookieForOrder(id, sellerCookies);
      assert(sc, 'no ship seller session');
      await patchStatus(sc, id, 'accepted');

      const blocked = await req(`/api/orders/${id}/status`, {
        method: 'PATCH',
        cookie: sc,
        body: { status: 'preparing' },
      });
      assert(blocked.status === 409 && blocked.json.error?.code === 'PAYMENT_REQUIRED', JSON.stringify(blocked.json));

      const upload = await req('/api/buyer/upload', {
        method: 'POST',
        cookie: buyer.cookie,
        body: {
          bucket: 'payment-proofs',
          contentType: 'image/png',
          dataBase64: TINY_PNG_B64,
          fileName: 'ship-proof',
        },
      });
      assert(upload.ok && upload.json.data?.url, JSON.stringify(upload.json));
      const proof = await req(`/api/orders/${id}/payment-proof`, {
        method: 'POST',
        cookie: buyer.cookie,
        body: { imageUrl: upload.json.data.url },
      });
      assert(proof.ok || proof.status === 201, JSON.stringify(proof.json));
      const verify = await req(`/api/orders/${id}/verify-payment`, {
        method: 'POST',
        cookie: sc,
        body: { approved: true },
      });
      assert(verify.ok, JSON.stringify(verify.json));

      await patchStatus(sc, id, 'preparing');
      await patchStatus(sc, id, 'picked_up');
      await patchStatus(sc, id, 'delivering');
      await patchStatus(buyer.cookie, id, 'completed');
    });
  }

  // ── Seller posts / shop ─────────────────────────────────
  console.log('\n— Seller posts —');
  let sellerPostId;
  await test('seller list posts + create', async () => {
    const list = await req('/api/seller/posts', { cookie: sellerFood.cookie });
    assert(list.ok && Array.isArray(list.json.data), `list ${list.status}`);
    const r = await req('/api/seller/posts', {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: {
        title: `Smoke post ${Date.now()}`,
        body: 'Bài test tự động',
        ctaLabel: 'Đặt Ngay',
      },
    });
    assert(r.ok, `create ${r.status} ${JSON.stringify(r.json)}`);
    sellerPostId = r.json.data?.id;
    assert(sellerPostId && r.json.data.status === 'published', JSON.stringify(r.json.data));
  });

  await test('new post in feed then hide', async () => {
    const feed = await req('/api/catalog/posts');
    assert((feed.json.data ?? []).some((p) => p.id === sellerPostId), 'not in feed');
    const hide = await req(`/api/seller/posts/${sellerPostId}`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { status: 'hidden' },
    });
    assert(hide.ok && hide.json.data.status === 'hidden', JSON.stringify(hide.json));
    const feed2 = await req('/api/catalog/posts');
    assert(!(feed2.json.data ?? []).some((p) => p.id === sellerPostId), 'still public');
  });

  await test('seller shop profile readable', async () => {
    const shop = await req('/api/seller/shop', { cookie: sellerFood.cookie });
    assert(shop.ok && shop.json.data?.shopName, `shop ${shop.status} ${JSON.stringify(shop.json)}`);
  });

  if (sellerPostId) {
    await test('seller delete post', async () => {
      const r = await req(`/api/seller/posts/${sellerPostId}`, {
        method: 'DELETE',
        cookie: sellerFood.cookie,
      });
      assert(r.ok, `delete ${r.status}`);
    });
  }

  // ── Admin ───────────────────────────────────────────────
  console.log('\n— Admin —');
  let adminBannerId;
  let adminPostId;

  await test('admin stats', async () => {
    const r = await req('/api/admin/stats', { cookie: admin.cookie });
    assert(r.ok, `status ${r.status}`);
  });

  await test('admin create/toggle/delete banner', async () => {
    const r = await req('/api/admin/banners', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        title: `Smoke popup ${Date.now()}`,
        subtitle: 'test',
        linkUrl: '/food',
        ctaLabel: 'OK',
        isPopup: true,
        isActive: true,
        sortOrder: 99,
      },
    });
    assert(r.ok, `create ${r.status} ${JSON.stringify(r.json)}`);
    adminBannerId = r.json.data?.id;
    const off = await req(`/api/admin/banners/${adminBannerId}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { isActive: false },
    });
    assert(off.ok && off.json.data.isActive === false, JSON.stringify(off.json));
    const cat = await req('/api/catalog/banners?popup=1');
    assert(!(cat.json.data ?? []).some((b) => b.id === adminBannerId), 'inactive still shown');
    const del = await req(`/api/admin/banners/${adminBannerId}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.ok, `delete ${del.status}`);
  });

  await test('admin create pinned post then delete', async () => {
    const r = await req('/api/admin/posts', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        title: `Admin smoke ${Date.now()}`,
        body: 'Hệ thống test',
        ctaLabel: 'Xem món',
        linkUrl: '/food',
        isPinned: true,
        status: 'published',
      },
    });
    assert(r.ok, `create ${r.status} ${JSON.stringify(r.json)}`);
    adminPostId = r.json.data?.id;
    const feed = await req('/api/catalog/posts');
    assert(feed.json.data?.[0]?.id === adminPostId, `first=${feed.json.data?.[0]?.id}`);
    await req(`/api/admin/posts/${adminPostId}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'hidden' },
    });
    const del = await req(`/api/admin/posts/${adminPostId}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.ok, `delete ${del.status}`);
  });

  // ── Authz ───────────────────────────────────────────────
  console.log('\n— Authz —');
  await test('buyer cannot access admin', async () => {
    const r = await req('/api/admin/banners', { cookie: buyer.cookie });
    assert(r.status === 401 || r.status === 403, `got ${r.status}`);
  });
  await test('buyer cannot create seller post', async () => {
    const r = await req('/api/seller/posts', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { title: 'hack' },
    });
    assert(r.status === 401 || r.status === 403, `got ${r.status}`);
  });
  await test('guest cannot checkout', async () => {
    const r = await req('/api/orders/food/checkout', {
      method: 'POST',
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(r.status === 401, `got ${r.status}`);
  });

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n——— Kết quả: ${passed} passed, ${failed} failed, ${skipped} skipped ———`);
  if (skips.length) {
    console.log('\nSkipped:');
    for (const s of skips) console.log(`  • ${s.name}: ${s.reason}`);
  }
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
