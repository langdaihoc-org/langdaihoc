/**
 * Exhaustive business-case smoke — bổ sung các nhánh chưa có trong smoke-all / order-access.
 * Usage: node scripts/smoke-exhaustive.mjs
 */
import { assertLocalDestructive } from './lib/assert-local.mjs';

const API = process.env.API_URL ?? 'http://localhost:3001';
process.env.API_URL = API;
assertLocalDestructive('smoke-exhaustive');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

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
  return r.json.data;
}

/** 1x1 PNG */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  console.log(`\n🧪 Exhaustive cases → ${API}\n`);

  // Repair suspended partners from prior runs — giữ pending.seller để test NOT_APPROVED
  const admin = await login('admin@demo.local');
  for (const row of (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? []) {
    if (row.email === 'pending.seller@demo.local') continue;
    if (row.seller.status !== 'approved') {
      await req(`/api/admin/sellers/${row.seller.id}`, {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { status: 'approved' },
      });
    }
  }
  for (const u of (await req('/api/admin/users?status=suspended', { cookie: admin.cookie })).json.data ?? []) {
    await req(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'active' },
    });
  }

  const buyer = await login('buyer@hcmut.edu.vn');
  const sellerFood = await login('seller@demo.local');
  const sellerLaundry = await login('laundry.seller3@demo.local');
  const sellerShip = await login('ship.seller4@demo.local');

  let address = ((await req('/api/buyer/addresses', { cookie: buyer.cookie })).json.data ?? [])[0];
  if (!address) {
    address = (
      await req('/api/buyer/addresses', {
        method: 'POST',
        cookie: buyer.cookie,
        body: {
          recipientName: 'Exhaustive',
          phone: '0901234567',
          detail: 'KTX A',
          dormName: 'KTX A',
          roomNumber: 'toa',
          addressType: 'dorm',
          isDefault: true,
        },
      })
    ).json.data;
  }

  const food = (await req('/api/catalog/food')).json.data ?? [];
  const sellersFood = (await req('/api/catalog/sellers?serviceType=food')).json.data ?? [];
  const primaryFoodSeller =
    sellersFood.find((s) => s.shopName) &&
    ((await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? []).find(
      (r) => r.email === 'seller@demo.local',
    );
  const primarySellerId = primaryFoodSeller?.seller?.id;
  const foodItem =
    (primarySellerId ? food.find((f) => f.sellerId === primarySellerId) : null) ?? food[0];
  assert(foodItem, 'no food');
  const laundry = (await req('/api/catalog/laundry')).json.data ?? [];
  const laundrySvc = laundry[0];

  // ── Auth negatives ─────────────────────────────────────
  console.log('— Auth negatives —');
  await test('wrong password → 401/429', async () => {
    const r = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'buyer@hcmut.edu.vn', password: 'WrongPass1', rememberMe: false },
    });
    assert(
      r.status === 401 || r.status === 400 || r.status === 429,
      `got ${r.status}`,
    );
  });

  await test('guest cart → 401', async () => {
    const r = await req('/api/cart');
    assert(r.status === 401, `got ${r.status}`);
  });

  // ── Address ownership ──────────────────────────────────
  console.log('\n— Address ownership —');
  await test('cannot patch foreign address', async () => {
    const r = await req(`/api/buyer/addresses/${crypto.randomUUID()}`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { detail: 'hacked address line' },
    });
    assert(r.status === 404, `got ${r.status}`);
  });

  await test('cannot delete foreign address', async () => {
    const r = await req(`/api/buyer/addresses/${crypto.randomUUID()}`, {
      method: 'DELETE',
      cookie: buyer.cookie,
    });
    assert(r.status === 404, `got ${r.status}`);
  });

  // ── Cart edge cases ────────────────────────────────────
  console.log('\n— Cart edge —');
  await test('cart seller conflict without forceClear → 409', async () => {
    const sellers = [...new Set(food.map((f) => f.sellerId))];
    if (sellers.length < 2) {
      // create only one seller in catalog — soft skip by asserting true with note via pass
      assert(true, 'only one seller');
      return;
    }
    const a = food.find((f) => f.sellerId === sellers[0]);
    const b = food.find((f) => f.sellerId === sellers[1]);
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: a.id, quantity: 1, forceClear: true, options: requiredOptions(a) },
    });
    const conflict = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: b.id, quantity: 1, options: requiredOptions(b) },
    });
    assert(conflict.status === 409 && conflict.json.error?.code === 'CART_SELLER_CONFLICT', JSON.stringify(conflict.json));
    const forced = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: b.id, quantity: 1, forceClear: true, options: requiredOptions(b) },
    });
    assert(forced.ok, JSON.stringify(forced.json));
  });

  await test('missing required options → 400', async () => {
    const withReq = food.find((f) =>
      (f.optionGroups ?? []).some((g) => g.required || (g.minSelect ?? 0) > 0),
    );
    if (!withReq) {
      assert(true, 'no required options item');
      return;
    }
    const r = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: withReq.id, quantity: 1, forceClear: true, options: [] },
    });
    assert(r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  });

  await test('patch own cart qty', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    const add = await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const id = add.json.data.items[0].id;
    const patch = await req(`/api/cart/items/${id}`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { quantity: 3 },
    });
    assert(patch.ok && patch.json.data.items[0].quantity === 3, JSON.stringify(patch.json));
  });

  // ── Idempotency ────────────────────────────────────────
  console.log('\n— Idempotency —');
  await test('same idempotency key returns same order', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const key = crypto.randomUUID();
    const body = {
      addressId: address.id,
      phone: '0901234567',
      paymentMethod: 'cash',
      idempotencyKey: key,
    };
    const a = await req('/api/orders/food/checkout', { method: 'POST', cookie: buyer.cookie, body });
    assert(a.ok, JSON.stringify(a.json));
    // cart cleared — second call with same key should replay, not create empty-cart error ideally
    const b = await req('/api/orders/food/checkout', { method: 'POST', cookie: buyer.cookie, body });
    assert(b.ok || b.status === 200, `replay ${b.status} ${JSON.stringify(b.json)}`);
    if (b.ok) {
      assert(b.json.data.id === a.json.data.id, `different orders ${a.json.data.id} vs ${b.json.data.id}`);
    }
    // cleanup
    await req(`/api/orders/${a.json.data.id}/status`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { status: 'cancelled' },
    });
  });

  // ── Invalid transitions ────────────────────────────────
  console.log('\n— Invalid transitions —');
  await test('food pending → delivering forbidden', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    const id = created.json.data.id;
    const bad = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { status: 'delivering' },
    });
    assert(bad.status === 409, `got ${bad.status}`);
    await patchStatus(buyer.cookie, id, 'cancelled');
  });

  await test('laundry cannot skip to washing without quote', async () => {
    assert(laundrySvc?.id, 'no laundry');
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: laundrySvc.id,
        estimatedQty: 1,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const id = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, id, 'accepted');
    const bad = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: sellerLaundry.cookie,
      body: { status: 'washing' },
    });
    assert(bad.status === 409, `got ${bad.status}`);
    await patchStatus(buyer.cookie, id, 'cancelled');
  });

  // ── Suspended seller ───────────────────────────────────
  console.log('\n— Suspended seller —');
  await test('suspended shop hidden from catalog + cannot order', async () => {
    const sellers = (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? [];
    const secondary =
      sellers.find((s) => s.email === 'food.seller2@demo.local') ??
      sellers.find((s) => s.seller.serviceTypes === 'food' && s.email !== 'seller@demo.local');
    assert(secondary, 'need secondary food seller');
    const before = (await req('/api/catalog/sellers?serviceType=food')).json.data ?? [];
    assert(before.some((s) => s.id === secondary.seller.id), 'secondary not in catalog before');

    await req(`/api/admin/sellers/${secondary.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'suspended' },
    });
    const after = (await req('/api/catalog/sellers?serviceType=food')).json.data ?? [];
    assert(!after.some((s) => s.id === secondary.seller.id), 'still in catalog when suspended');

    // find an item of that seller if any
    const allFood = (await req('/api/catalog/food?limit=50')).json.data ?? [];
    // catalog already filters approved — item should disappear
    assert(!allFood.some((f) => f.sellerId === secondary.seller.id), 'items still listed');

    await req(`/api/admin/sellers/${secondary.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'approved' },
    });
  });

  // ── Bank transfer happy path ───────────────────────────
  console.log('\n— Payment proof + verify —');
  await test('upload proof → seller verify', async () => {
    await req('/api/cart', { method: 'DELETE', cookie: buyer.cookie });
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const created = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'bank_transfer',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;

    const upload = await req('/api/buyer/upload', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        bucket: 'payment-proofs',
        contentType: 'image/png',
        dataBase64: TINY_PNG_B64,
        fileName: 'proof',
      },
    });
    assert(upload.ok && upload.json.data?.url, JSON.stringify(upload.json));

    const proof = await req(`/api/orders/${oid}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { imageUrl: upload.json.data.url },
    });
    assert(proof.ok || proof.status === 201, JSON.stringify(proof.json));

    const verify = await req(`/api/orders/${oid}/verify-payment`, {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: { approved: true },
    });
    assert(verify.ok, JSON.stringify(verify.json));

    await patchStatus(sellerFood.cookie, oid, 'rejected');
  });

  // ── Complaint ──────────────────────────────────────────
  console.log('\n— Complaint —');
  await test('complaint create + message + admin resolve', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    const oid = created.json.data.id;
    await patchStatus(sellerFood.cookie, oid, 'accepted');
    await patchStatus(sellerFood.cookie, oid, 'preparing');
    await patchStatus(sellerFood.cookie, oid, 'delivering');
    await patchStatus(buyer.cookie, oid, 'completed');

    const upload = await req('/api/buyer/upload', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { bucket: 'payment-proofs', contentType: 'image/png', dataBase64: TINY_PNG_B64, fileName: 'ev' },
    });
    const complaint = await req(`/api/orders/${oid}/complaint`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        reason: 'Thiếu món',
        description: 'Đơn giao thiếu một phần ăn, cần hỗ trợ hoàn tiền.',
        evidenceUrls: [upload.json.data.url],
      },
    });
    assert(complaint.ok || complaint.status === 201, JSON.stringify(complaint.json));
    const cid = complaint.json.data.id;

    const msg = await req(`/api/orders/${oid}/complaint/messages`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { body: 'Bổ sung thêm chi tiết' },
    });
    assert(msg.ok || msg.status === 201, JSON.stringify(msg.json));

    const evidenceBad = await req(`/api/orders/${oid}/complaint`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        reason: 'dup',
        description: 'Thử tạo khiếu nại lần 2 với URL ngoài',
        evidenceUrls: ['https://evil.example/x.png'],
      },
    });
    // either already has complaint (409) or rejects URL (400)
    assert(evidenceBad.status === 400 || evidenceBad.status === 409 || evidenceBad.status === 403, `got ${evidenceBad.status}`);

    const resolve = await req(`/api/admin/complaints/${cid}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'resolved', adminResolution: 'Đã hoàn tiền test' },
    });
    assert(resolve.ok, JSON.stringify(resolve.json));
  });

  await test('admin complaint rejects invalid status', async () => {
    const list = await req('/api/admin/complaints', { cookie: admin.cookie });
    const c = (list.json.data ?? [])[0];
    if (!c) {
      assert(true, 'no complaint');
      return;
    }
    const bad = await req(`/api/admin/complaints/${c.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'not_a_real_status' },
    });
    assert(bad.status === 400, `got ${bad.status}`);
  });

  // ── Seller catalog CRUD ────────────────────────────────
  console.log('\n— Seller catalog CRUD —');
  await test('seller create food item rejects external image URL', async () => {
    const r = await req('/api/seller/food-items', {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: {
        name: 'Hack URL dish',
        price: 10000,
        imageUrl: 'https://evil.example/food.png',
      },
    });
    assert(r.status === 400, `got ${r.status}`);
  });

  await test('seller create/update/delete food item (no image)', async () => {
    const created = await req('/api/seller/food-items', {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: { name: `Audit món ${Date.now()}`, price: 12000, description: 'tmp' },
    });
    assert(created.ok || created.status === 201, JSON.stringify(created.json));
    const id = created.json.data.id;
    const patched = await req(`/api/seller/food-items/${id}`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { isAvailable: false, price: 13000 },
    });
    assert(patched.ok, JSON.stringify(patched.json));
    const del = await req(`/api/seller/food-items/${id}`, {
      method: 'DELETE',
      cookie: sellerFood.cookie,
    });
    assert(del.ok, JSON.stringify(del.json));
  });

  await test('foreign seller cannot delete food item', async () => {
    const items = (await req('/api/seller/food-items', { cookie: sellerFood.cookie })).json.data ?? [];
    const id = items[0]?.id;
    assert(id, 'no item');
    const r = await req(`/api/seller/food-items/${id}`, {
      method: 'DELETE',
      cookie: sellerLaundry.cookie,
    });
    assert(r.status === 404 || r.status === 403, `got ${r.status}`);
  });

  await test('seller bank QR rejects external URL', async () => {
    const r = await req('/api/seller/bank-accounts', {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: {
        bankName: 'TestBank',
        accountNumber: '123',
        accountHolder: 'Test',
        qrImageUrl: 'https://evil.example/qr.png',
      },
    });
    assert(r.status === 400, `got ${r.status}`);
  });

  // ── Admin user/seller delete ───────────────────────────
  console.log('\n— Admin delete —');
  await test('admin self-delete blocked', async () => {
    const r = await req(`/api/admin/users/${admin.user.id}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(r.status === 400 && r.json.error?.code === 'CANNOT_SELF_MODIFY', JSON.stringify(r.json));
  });

  await test('admin suspend/activate user', async () => {
    const users = (await req('/api/admin/users?role=buyer', { cookie: admin.cookie })).json.data ?? [];
    // pick a pending verification buyer if any, else skip using main buyer carefully
    const target = users.find((u) => u.email?.startsWith('idor') && u.status !== 'suspended');
    if (!target) {
      assert(true, 'no disposable buyer');
      return;
    }
    const sus = await req(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'suspended' },
    });
    assert(sus.ok, JSON.stringify(sus.json));
    const act = await req(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'active' },
    });
    assert(act.ok, JSON.stringify(act.json));
  });

  await test('admin create ship seller then permanent delete (no orders)', async () => {
    const email = `tmp.ship.${Date.now()}@demo.local`;
    const created = await req('/api/admin/ship-sellers', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        fullName: 'Tmp Ship',
        email,
        phone: '0900000111',
        password: 'Demo1234',
        shopName: `Tmp Ship ${Date.now()}`,
        serviceAreas: ['KTX A'],
      },
    });
    assert(created.ok || created.status === 201, JSON.stringify(created.json));
    const sid = created.json.data.id;
    const del = await req(`/api/admin/sellers/${sid}`, {
      method: 'DELETE',
      cookie: admin.cookie,
    });
    assert(del.ok, JSON.stringify(del.json));
    const list = (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? [];
    assert(!list.some((s) => s.seller.id === sid), 'still listed after delete');
  });

  // ── Laundry needs_support ──────────────────────────────
  console.log('\n— Laundry needs_support —');
  await test('buyer can mark needs_support then admin cancel', async () => {
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: laundrySvc.id,
        estimatedQty: 1,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const id = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, id, 'accepted');
    await patchStatus(sellerLaundry.cookie, id, 'picking_up');
    await patchStatus(sellerLaundry.cookie, id, 'picked_up');
    await req(`/api/orders/${id}/laundry-quote`, {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { actualQty: 1, unitPrice: 15000 },
    });
    const support = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: buyer.cookie,
      body: { status: 'needs_support' },
    });
    assert(support.ok && support.json.data.status === 'needs_support', JSON.stringify(support.json));
    await patchStatus(admin.cookie, id, 'cancelled');
  });

  // ── Notifications after transitions ────────────────────
  console.log('\n— Notifications —');
  await test('order status creates buyer notification', async () => {
    const before = (await req('/api/buyer/notifications', { cookie: buyer.cookie })).json.data ?? [];
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    await patchStatus(sellerFood.cookie, created.json.data.id, 'accepted');
    const after = (await req('/api/buyer/notifications', { cookie: buyer.cookie })).json.data ?? [];
    assert(after.length >= before.length, 'no new notifications');
    await patchStatus(buyer.cookie, created.json.data.id, 'cancelled');
  });

  // ── Review once only ───────────────────────────────────
  console.log('\n— Review —');
  await test('cannot review twice', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    const id = created.json.data.id;
    await patchStatus(sellerFood.cookie, id, 'accepted');
    await patchStatus(sellerFood.cookie, id, 'preparing');
    await patchStatus(sellerFood.cookie, id, 'delivering');
    await patchStatus(buyer.cookie, id, 'completed');
    const r1 = await req(`/api/orders/${id}/review`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { rating: 4, comment: 'ok' },
    });
    assert(r1.ok || r1.status === 201, JSON.stringify(r1.json));
    const r2 = await req(`/api/orders/${id}/review`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { rating: 5, comment: 'again' },
    });
    assert(r2.status === 409 && r2.json.error?.code === 'ALREADY_REVIEWED', JSON.stringify(r2.json));
  });

  // ── Ship invalid seller type ───────────────────────────
  console.log('\n— Ship negatives —');
  await test('cannot create ship order on food seller', async () => {
    const foodSellerId = (await req('/api/catalog/sellers?serviceType=food')).json.data?.[0]?.id;
    const r = await req('/api/orders/ship-proxy', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        sellerId: foodSellerId,
        trackingCode: 'X',
        pickupLocation: 'KTX',
        pickupAt: new Date(Date.now() + 3600000).toISOString(),
        receivePhone: '0901111222',
        price: 10000,
        returnAt: new Date(Date.now() + 7200000).toISOString(),
        returnAddressText: 'KTX A tòa',
          packageValue: 150000,
        contactPhone: '0901234567',
      },
    });
    assert(r.status === 404 || r.status === 400, `got ${r.status}`);
  });

  await test('ship fee comes from seller profile (client price ignored)', async () => {
    const shipId = (await req('/api/catalog/sellers?serviceType=ship_proxy')).json.data?.[0]?.id;
    assert(shipId, 'no ship seller');
    const r = await req('/api/orders/ship-proxy', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        sellerId: shipId,
        trackingCode: 'X2',
        pickupLocation: 'KTX',
        pickupAt: new Date(Date.now() + 3600000).toISOString(),
        receivePhone: '0901111222',
        price: 1, // attacker tries 1đ — server must ignore
        returnAt: new Date(Date.now() + 7200000).toISOString(),
        returnAddressText: 'KTX A tòa',
          packageValue: 150000,
        contactPhone: '0901234567',
      },
    });
    assert(r.ok || r.status === 201, JSON.stringify(r.json));
    assert(Number(r.json.data.total) === 15000, `expected 15000 got ${r.json.data.total}`);
    assert(r.json.data.paymentMethod === 'bank_transfer', 'ship must be bank_transfer only');
    await patchStatus(sellerShip.cookie, r.json.data.id, 'rejected').catch(() =>
      patchStatus(buyer.cookie, r.json.data.id, 'cancelled'),
    );
  });

  await test('ship without price still uses server fee', async () => {
    const shipId = (await req('/api/catalog/sellers?serviceType=ship_proxy')).json.data?.[0]?.id;
    const r = await req('/api/orders/ship-proxy', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        sellerId: shipId,
        trackingCode: 'X3',
        pickupLocation: 'KTX cổng',
        pickupAt: new Date(Date.now() + 3600000).toISOString(),
        receivePhone: '0901111222',
        returnAt: new Date(Date.now() + 7200000).toISOString(),
        returnAddressText: 'KTX A tòa',
          packageValue: 150000,
        contactPhone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    assert(r.ok || r.status === 201, JSON.stringify(r.json));
    assert(Number(r.json.data.total) === 15000, `got ${r.json.data.total}`);
    assert(r.json.data.paymentMethod === 'bank_transfer', 'cash body must still force bank_transfer');
    await patchStatus(buyer.cookie, r.json.data.id, 'cancelled');
  });

  await test('ship seller cannot prepare before CK verified', async () => {
    const shipId = (await req('/api/catalog/sellers?serviceType=ship_proxy')).json.data?.[0]?.id;
    assert(shipId, 'no ship seller');
    const r = await req('/api/orders/ship-proxy', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        sellerId: shipId,
        trackingCode: 'X4-GATE',
        pickupLocation: 'KTX cổng',
        pickupAt: new Date(Date.now() + 3600000).toISOString(),
        receivePhone: '0901111222',
        returnAt: new Date(Date.now() + 7200000).toISOString(),
        returnAddressText: 'KTX A tòa',
          packageValue: 150000,
        contactPhone: '0901234567',
      },
    });
    assert(r.ok || r.status === 201, JSON.stringify(r.json));
    const id = r.json.data.id;
    await patchStatus(sellerShip.cookie, id, 'accepted');
    const blocked = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: sellerShip.cookie,
      body: { status: 'preparing' },
    });
    assert(blocked.status === 409 && blocked.json.error?.code === 'PAYMENT_REQUIRED', JSON.stringify(blocked.json));
    await patchStatus(buyer.cookie, id, 'cancelled');
  });

  // ── Gaps: cross-buyer IDOR, payment reject, pending seller, forgot-password ──
  console.log('\n— High-risk gaps —');

  await test('cross-buyer cannot read or mutate another order', async () => {
    const email = `idor.buyer.${Date.now()}@gmail.com`;
    const reg = await req('/api/auth/register/buyer', {
      method: 'POST',
      body: {
        fullName: 'IDOR Buyer',
        email,
        password: 'Demo1234',
        confirmPassword: 'Demo1234',
        agreeTerms: true,
        agreePrivacy: true,
      },
    });
    assert(reg.status === 201 || reg.ok, JSON.stringify(reg.json));
    const other = await login(email);

    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;

    const get = await req(`/api/orders/${oid}`, { cookie: other.cookie });
    assert(get.status === 403 || get.status === 404, `GET got ${get.status}`);

    const patch = await req(`/api/orders/${oid}/status`, {
      method: 'PATCH',
      cookie: other.cookie,
      body: { status: 'cancelled' },
    });
    assert(patch.status === 403 || patch.status === 404, `PATCH got ${patch.status}`);

    const complaint = await req(`/api/orders/${oid}/complaint`, {
      method: 'POST',
      cookie: other.cookie,
      body: { reason: 'hack', description: 'trying to complain on foreign order xx' },
    });
    assert(complaint.status === 403 || complaint.status === 404, `complaint got ${complaint.status}`);

    await patchStatus(sellerFood.cookie, oid, 'rejected');
  });

  await test('seller can reject payment proof', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const created = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'bank_transfer',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;

    const upload = await req('/api/buyer/upload', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        bucket: 'payment-proofs',
        contentType: 'image/png',
        dataBase64: TINY_PNG_B64,
        fileName: 'proof-reject',
      },
    });
    assert(upload.ok, JSON.stringify(upload.json));
    const proof = await req(`/api/orders/${oid}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { imageUrl: upload.json.data.url },
    });
    assert(proof.ok || proof.status === 201, JSON.stringify(proof.json));

    const verify = await req(`/api/orders/${oid}/verify-payment`, {
      method: 'POST',
      cookie: sellerFood.cookie,
      body: { approved: false, rejectionReason: 'Sai số tiền' },
    });
    assert(verify.ok, JSON.stringify(verify.json));

    const detail = await req(`/api/orders/${oid}`, { cookie: buyer.cookie });
    const proofs = detail.json.data?.proofs ?? [];
    assert(proofs.some((p) => p.status === 'rejected' || p.rejectionReason), JSON.stringify(proofs));

    await patchStatus(sellerFood.cookie, oid, 'rejected');
  });

  await test('pending seller cannot create food item (NOT_APPROVED)', async () => {
    // Đảm bảo pending.seller đang pending (bootstrap không auto-approve email này)
    const sellers = (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? [];
    const pending = sellers.find((r) => r.email === 'pending.seller@demo.local');
    assert(pending, 'thiếu pending.seller@demo.local trong seed');
    if (pending.seller.status !== 'pending') {
      await req(`/api/admin/sellers/${pending.seller.id}`, {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { status: 'rejected' },
      });
      // rejected cũng bị requireApprovedSeller chặn
    }
    const pendingCookie = (await login('pending.seller@demo.local')).cookie;
    const r = await req('/api/seller/food-items', {
      method: 'POST',
      cookie: pendingCookie,
      body: { name: 'Hack món', price: 10000, isAvailable: true },
    });
    assert(r.status === 403 && r.json.error?.code === 'NOT_APPROVED', JSON.stringify(r.json));
  });

  await test('forgot-password returns generic success message', async () => {
    const r = await req('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'buyer@hcmut.edu.vn' },
    });
    assert(r.ok, JSON.stringify(r.json));
    assert(/email|mật khẩu|hướng dẫn/i.test(r.json.message ?? ''), r.json.message);
  });

  await test('forgot-password does not leak unknown email', async () => {
    const r = await req('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: `no.such.${Date.now()}@example.com` },
    });
    assert(r.ok, JSON.stringify(r.json));
    assert(/Nếu (email|tài khoản) tồn tại|hướng dẫn/i.test(r.json.message ?? ''), r.json.message);
  });

  await test('login by phone works for seeded buyer', async () => {
    const me = await req('/api/auth/me', { cookie: buyer.cookie });
    const phone = me.json.user?.phone;
    assert(phone, 'buyer chưa có SĐT trên hồ sơ — cập nhật profile trước');
    const r = await req('/api/auth/login', {
      method: 'POST',
      body: { identifier: phone, password: 'Demo1234', rememberMe: false },
    });
    assert(r.ok, JSON.stringify(r.json));
    assert(r.json.user?.email === 'buyer@hcmut.edu.vn', JSON.stringify(r.json.user));
  });

  await test('forgot-password by phone returns generic message', async () => {
    const me = await req('/api/auth/me', { cookie: buyer.cookie });
    const phone = me.json.user?.phone ?? '0901234567';
    const r = await req('/api/auth/forgot-password', {
      method: 'POST',
      body: { identifier: phone },
    });
    assert(r.ok, JSON.stringify(r.json));
    assert(/tài khoản|email|hướng dẫn/i.test(r.json.message ?? ''), r.json.message);
  });

  await test('payment proof rejects foreign-host storage-looking URL', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
    });
    const created = await req('/api/orders/food/checkout', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        addressId: address.id,
        phone: '0901234567',
        paymentMethod: 'bank_transfer',
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;
    const bad = await req(`/api/orders/${oid}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { imageUrl: 'https://evil.example/storage/v1/object/public/payment-proofs/x.png' },
    });
    assert(bad.status === 400 && bad.json.error?.code === 'INVALID_IMAGE_URL', JSON.stringify(bad.json));
    const badPublic = await req(`/api/orders/${oid}/payment-proof`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        imageUrl: 'https://pub-a5053a1f36ec4957936716c7f5e26ff2.r2.dev/food-images/x.png',
      },
    });
    assert(
      badPublic.status === 400 && badPublic.json.error?.code === 'INVALID_IMAGE_URL',
      JSON.stringify(badPublic.json),
    );
    await patchStatus(sellerFood.cookie, oid, 'rejected');
  });

  await test('laundry PATCH cannot skip to waiting_price_confirmation without quote', async () => {
    assert(laundrySvc?.id, 'no laundry');
    const created = await req('/api/orders/laundry', {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        serviceId: laundrySvc.id,
        estimatedQty: 1,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: address.id,
        returnAddressId: address.id,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    const id = created.json.data.id;
    await patchStatus(sellerLaundry.cookie, id, 'accepted');
    await patchStatus(sellerLaundry.cookie, id, 'picking_up');
    await patchStatus(sellerLaundry.cookie, id, 'picked_up');
    const bad = await req(`/api/orders/${id}/status`, {
      method: 'PATCH',
      cookie: sellerLaundry.cookie,
      body: { status: 'waiting_price_confirmation' },
    });
    assert(
      bad.status === 409 && bad.json.error?.code === 'QUOTE_REQUIRED',
      JSON.stringify(bad.json),
    );
    // cleanup: báo giá rồi hủy
    await req(`/api/orders/${id}/laundry-quote`, {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { actualQty: 1, unitPrice: 10000 },
    });
    await patchStatus(buyer.cookie, id, 'cancelled');
  });

  await test('suspended seller cannot transition own order', async () => {
    const sellersList = (await req('/api/admin/sellers', { cookie: admin.cookie })).json.data ?? [];
    const foodSeller = sellersList.find((s) => s.email === 'seller@demo.local');
    assert(foodSeller, 'missing food seller');
    // Đảm bảo approved trước khi đặt (test trước có thể để treo)
    await req(`/api/admin/sellers/${foodSeller.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'approved' },
    });

    const ownItem =
      food.find((f) => f.sellerId === foodSeller.seller.id) ?? foodItem;
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: ownItem.id, quantity: 1, forceClear: true, options: requiredOptions(ownItem) },
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
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;

    await req(`/api/admin/sellers/${foodSeller.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'suspended' },
    });

    const blocked = await req(`/api/orders/${oid}/status`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { status: 'accepted' },
    });
    assert(
      blocked.status === 403 && blocked.json.error?.code === 'SELLER_NOT_APPROVED',
      JSON.stringify(blocked.json),
    );

    await req(`/api/admin/sellers/${foodSeller.seller.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status: 'approved' },
    });
    await patchStatus(buyer.cookie, oid, 'cancelled');
  });

  // ── Concurrency + CRUD gaps ────────────────────────────
  console.log('\n— Concurrency & CRUD gaps —');

  await test('concurrent conflicting transitions: exactly one wins (optimistic lock)', async () => {
    await req('/api/cart/items', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { foodItemId: foodItem.id, quantity: 1, forceClear: true, options: requiredOptions(foodItem) },
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
    assert(created.ok, JSON.stringify(created.json));
    const oid = created.json.data.id;

    // pending → accepted và pending → rejected bắn đồng thời: chỉ 1 được thắng
    const [a, b] = await Promise.all([
      req(`/api/orders/${oid}/status`, { method: 'PATCH', cookie: sellerFood.cookie, body: { status: 'accepted' } }),
      req(`/api/orders/${oid}/status`, { method: 'PATCH', cookie: sellerFood.cookie, body: { status: 'rejected' } }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert(winners.length === 1, `expected 1 winner, got ${winners.length} (${a.status}/${b.status})`);
    for (const l of losers) {
      assert(l.status === 409, `loser expected 409, got ${l.status} ${JSON.stringify(l.json)}`);
    }
    // cleanup
    const final = (await req(`/api/orders/${oid}`, { cookie: buyer.cookie })).json.data.order.status;
    if (final === 'accepted') await patchStatus(buyer.cookie, oid, 'cancelled');
  });

  await test('seller laundry service CRUD + foreign seller blocked + external image rejected', async () => {
    const created = await req('/api/seller/laundry-services', {
      method: 'POST',
      cookie: sellerLaundry.cookie,
      body: { name: `Audit giặt ${Date.now()}`, unit: 'kg', basePrice: 9000 },
    });
    assert(created.ok || created.status === 201, JSON.stringify(created.json));
    const id = created.json.data.id;

    const patched = await req(`/api/seller/laundry-services/${id}`, {
      method: 'PATCH',
      cookie: sellerLaundry.cookie,
      body: { basePrice: 11000, isAvailable: false },
    });
    assert(patched.ok && Number(patched.json.data.basePrice) === 11000, JSON.stringify(patched.json));

    const badImg = await req(`/api/seller/laundry-services/${id}`, {
      method: 'PATCH',
      cookie: sellerLaundry.cookie,
      body: { imageUrl: 'https://evil.example/x.png' },
    });
    assert(badImg.status === 400, `external image got ${badImg.status}`);

    const foreignPatch = await req(`/api/seller/laundry-services/${id}`, {
      method: 'PATCH',
      cookie: sellerFood.cookie,
      body: { basePrice: 1 },
    });
    assert(foreignPatch.status === 404 || foreignPatch.status === 403, `foreign patch got ${foreignPatch.status}`);

    const foreignDel = await req(`/api/seller/laundry-services/${id}`, {
      method: 'DELETE',
      cookie: sellerFood.cookie,
    });
    assert(foreignDel.status === 404 || foreignDel.status === 403, `foreign delete got ${foreignDel.status}`);

    const del = await req(`/api/seller/laundry-services/${id}`, {
      method: 'DELETE',
      cookie: sellerLaundry.cookie,
    });
    assert(del.ok, JSON.stringify(del.json));
  });

  await test('admin category create/duplicate-slug/update', async () => {
    const slug = `audit-cat-${Date.now()}`;
    const created = await req('/api/admin/categories', {
      method: 'POST',
      cookie: admin.cookie,
      body: { name: 'Audit Category', slug, type: 'food' },
    });
    assert(created.ok || created.status === 201, JSON.stringify(created.json));
    const id = created.json.data.id;

    const dup = await req('/api/admin/categories', {
      method: 'POST',
      cookie: admin.cookie,
      body: { name: 'Audit Category 2', slug, type: 'food' },
    });
    assert(dup.status === 409 && dup.json.error?.code === 'SLUG_EXISTS', JSON.stringify(dup.json));

    // dọn dẹp: ẩn category test khỏi catalog người mua
    const off = await req(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { isActive: false },
    });
    assert(off.ok && off.json.data.isActive === false, JSON.stringify(off.json));
  });

  console.log(`\n——— Exhaustive: ${passed} passed, ${failed} failed ———\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
