/**
 * Smoke test cho các lỗ IDOR / phân quyền vừa vá trên /api/orders.
 * Chạy: node scripts/smoke-order-access.mjs
 */
import { assertLocalDestructive } from './lib/assert-local.mjs';

const API = process.env.API_URL ?? 'http://localhost:3001';
process.env.API_URL = API;
assertLocalDestructive('smoke-order-access');

const ACCOUNTS = {
  buyer: { email: 'buyer@hcmut.edu.vn', password: 'Demo1234' },
  sellerFood: { email: 'seller@demo.local', password: 'Demo1234' },
  sellerLaundry: { email: 'laundry.seller3@demo.local', password: 'Demo1234' },
  admin: { email: 'admin@demo.local', password: 'Demo1234' },
};

let pass = 0;
let fail = 0;

/** Món demo có nhóm tuỳ chọn bắt buộc — phải chọn sẵn 1 option mỗi nhóm. */
function requiredOptions(item) {
  return (item.optionGroups ?? [])
    .filter((g) => g.required || (g.minSelect ?? 0) > 0)
    .map((g) => g.options?.[0])
    .filter(Boolean)
    .map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta }));
}

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* body rỗng */
  }
  return { status: res.status, json, res };
}

/** Auth dùng httpOnly cookie nên phải giữ nguyên cookie jar cho từng tài khoản. */
async function login(acc) {
  const { status, json, res } = await call('/api/auth/login', {
    method: 'POST',
    body: { ...acc, rememberMe: false },
  });
  if (status !== 200) throw new Error(`Login ${acc.email} thất bại (${status}) ${JSON.stringify(json)}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const jar = cookies.map((c) => c.split(';')[0]).join('; ');
  if (!jar) throw new Error(`Login ${acc.email} không trả cookie`);
  return jar;
}

/** Tạo 1 đơn food mới qua đúng luồng checkout thật (cũng là happy-path test). */
async function createOrder(buyerToken) {
  const item = (await call('/api/catalog/food?limit=1')).json?.data?.[0];
  if (!item) throw new Error('Không có món nào trong catalog — hãy seed lại DB');

  const add = await call('/api/cart/items', {
    token: buyerToken,
    method: 'POST',
    body: { foodItemId: item.id, quantity: 1, forceClear: true, options: requiredOptions(item) },
  });
  if (add.status >= 300) throw new Error(`Thêm giỏ thất bại: ${add.status} ${JSON.stringify(add.json)}`);

  let addresses = (await call('/api/buyer/addresses', { token: buyerToken })).json?.data ?? [];
  if (addresses.length === 0) {
    const created = await call('/api/buyer/addresses', {
      token: buyerToken,
      method: 'POST',
      body: {
        recipientName: 'Smoke Test',
        phone: '0900000001',
        detail: 'KTX Khu A, phòng A1-101',
        addressType: 'dorm',
        isDefault: true,
      },
    });
    addresses = [created.json?.data];
  }

  const checkout = await call('/api/orders/food/checkout', {
    token: buyerToken,
    method: 'POST',
    body: {
      addressId: addresses[0].id,
      phone: '0900000001',
      paymentMethod: 'cash',
      idempotencyKey: crypto.randomUUID(),
    },
  });
  check(
    'checkout có key → 2xx',
    checkout.status < 300,
    `nhận ${checkout.status} ${JSON.stringify(checkout.json)}`,
  );
  return { order: checkout.json?.data, item, addresses };
}

async function main() {
  const tokens = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    tokens[key] = await login(acc);
  }
  console.log('Đăng nhập 4 tài khoản demo: OK\n');

  console.log('0. Tạo đơn mới qua luồng checkout thật');
  const { order: target } = await createOrder(tokens.buyer);
  if (!target?.id) throw new Error('Checkout không trả về đơn');
  console.log(`Đơn dùng để test: ${target.orderCode} (${target.type}/${target.status})\n`);

  console.log('1. Đọc đơn của người khác');
  const foreignSellerRead = await call(`/api/orders/${target.id}`, { token: tokens.sellerLaundry });
  check('seller lạ GET /orders/:id → 403', foreignSellerRead.status === 403, `nhận ${foreignSellerRead.status}`);

  console.log('2. PATCH /:id/status trên đơn người khác (lỗi 🔴 #1)');
  const foreignPatch = await call(`/api/orders/${target.id}/status`, {
    token: tokens.sellerLaundry,
    method: 'PATCH',
    body: { status: 'cancelled', note: 'idor' },
  });
  check('seller lạ đổi trạng thái → 403', foreignPatch.status === 403, `nhận ${foreignPatch.status}`);

  console.log('3. Buyer tự nhận đơn thay quán (ma trận role×transition)');
  const selfAccept = await call(`/api/orders/${target.id}/status`, {
    token: tokens.buyer,
    method: 'PATCH',
    body: { status: 'accepted' },
  });
  check(
    'buyer set accepted → 403/409',
    selfAccept.status === 403 || selfAccept.status === 409,
    `nhận ${selfAccept.status} ${JSON.stringify(selfAccept.json)}`,
  );

  console.log('4. Seller lạ can thiệp tiền (lỗi 🔴 #2)');
  for (const [path, body] of [
    ['verify-payment', { approved: true }],
    ['mark-paid', {}],
    ['laundry-quote', { actualQty: 1, unitPrice: 1000 }],
  ]) {
    const r = await call(`/api/orders/${target.id}/${path}`, {
      token: tokens.sellerLaundry,
      method: 'POST',
      body,
    });
    check(`seller lạ POST /${path} → 403`, r.status === 403, `nhận ${r.status}`);
  }

  console.log('5. Người ngoài can thiệp giá đơn giặt (route trước đây chỉ có buyerGuard)');
  for (const path of ['confirm-price', 'reject-price']) {
    const r = await call(`/api/orders/${target.id}/${path}`, {
      token: tokens.sellerLaundry,
      method: 'POST',
    });
    check(`người ngoài POST /${path} → 403`, r.status === 403, `nhận ${r.status}`);
  }

  console.log('5b. Rollback khi transition không hợp lệ (lỗi bỏ sót: thiếu transaction)');
  const badConfirm = await call(`/api/orders/${target.id}/confirm-price`, {
    token: tokens.buyer,
    method: 'POST',
  });
  check(
    'chủ đơn confirm-price trên đơn food → 409',
    badConfirm.status === 409,
    `nhận ${badConfirm.status} ${JSON.stringify(badConfirm.json)}`,
  );
  const afterBad = (await call(`/api/orders/${target.id}`, { token: tokens.buyer })).json?.data?.order;
  check(
    'đơn giữ nguyên trạng thái pending sau khi rollback',
    afterBad?.status === 'pending',
    `trạng thái hiện tại ${afterBad?.status}`,
  );

  const foreignProof = await call(`/api/orders/${target.id}/payment-proof`, {
    token: tokens.sellerLaundry,
    method: 'POST',
    body: { imageUrl: 'http://evil.example.com/fake.png' },
  });
  check(
    'người ngoài POST /payment-proof → 400/403',
    foreignProof.status === 400 || foreignProof.status === 403,
    `nhận ${foreignProof.status}`,
  );

  console.log('6. Checkout thiếu Idempotency-Key (lỗi 🟠 #3)');
  const noKey = await call('/api/orders/food/checkout', {
    token: tokens.buyer,
    method: 'POST',
    body: {
      addressId: '00000000-0000-0000-0000-000000000000',
      phone: '0900000000',
      paymentMethod: 'cash',
    },
  });
  check(
    'thiếu key → 400 IDEMPOTENCY_KEY_REQUIRED',
    noKey.status === 400 && noKey.json?.error?.code === 'IDEMPOTENCY_KEY_REQUIRED',
    `nhận ${noKey.status} ${JSON.stringify(noKey.json)}`,
  );

  console.log('7. bank-info của quán không liên quan (rò rỉ STK)');
  const sellerList = (await call('/api/catalog/sellers')).json?.data ?? [];
  const otherSellerId = sellerList.find((s) => s.id !== target.sellerId)?.id;
  if (otherSellerId) {
    const leak = await call(`/api/orders/bank-info/${otherSellerId}`, { token: tokens.sellerLaundry });
    check('seller lạ đọc STK quán khác → 403', leak.status === 403, `nhận ${leak.status}`);
    const own = await call(`/api/orders/bank-info/${target.sellerId}`, { token: tokens.buyer });
    check('buyer có đơn đọc STK quán đó → 200', own.status === 200, `nhận ${own.status}`);
  } else {
    console.log('  SKIP  không tìm được seller thứ hai');
  }

  console.log('8. Happy path: chủ đơn vẫn làm được việc của mình');
  const ownerRead = await call(`/api/orders/${target.id}`, { token: tokens.buyer });
  check('buyer chủ đơn GET → 200', ownerRead.status === 200, `nhận ${ownerRead.status}`);

  let sellerOwnerToken = null;
  for (const key of ['sellerFood', 'sellerLaundry']) {
    const r = await call(`/api/orders/${target.id}`, { token: tokens[key] });
    if (r.status === 200) sellerOwnerToken = tokens[key];
  }
  check('tìm được seller chủ đơn', !!sellerOwnerToken);

  if (sellerOwnerToken && target.status === 'pending') {
    const accept = await call(`/api/orders/${target.id}/status`, {
      token: sellerOwnerToken,
      method: 'PATCH',
      body: { status: 'accepted' },
    });
    check('seller chủ đơn pending→accepted → 200', accept.status === 200, `nhận ${accept.status} ${JSON.stringify(accept.json)}`);

    const cancel = await call(`/api/orders/${target.id}/status`, {
      token: tokens.buyer,
      method: 'PATCH',
      body: { status: 'cancelled', note: 'smoke test' },
    });
    check('buyer chủ đơn accepted→cancelled → 200', cancel.status === 200, `nhận ${cancel.status} ${JSON.stringify(cancel.json)}`);
  }

  console.log('9. Checkout món bị ẩn sau khi đã vào giỏ (lỗi 🟠 #4)');
  const foodRes = (await call('/api/catalog/food?limit=1')).json?.data;
  const item = (Array.isArray(foodRes) ? foodRes : foodRes?.items)?.[0];
  const addresses = (await call('/api/buyer/addresses', { token: tokens.buyer })).json?.data ?? [];
  if (item && addresses.length > 0) {
    let ownerToken = null;
    for (const key of ['sellerFood', 'sellerLaundry']) {
      const r = await call(`/api/seller/food-items/${item.id}`, {
        token: tokens[key],
        method: 'PATCH',
        body: { isAvailable: true },
      });
      if (r.status === 200) ownerToken = tokens[key];
    }
    if (!ownerToken) {
      console.log('  SKIP  không xác định được quán sở hữu món');
    } else {
      const addRes = await call('/api/cart/items', {
        token: tokens.buyer,
        method: 'POST',
        body: { foodItemId: item.id, quantity: 1, forceClear: true, options: requiredOptions(item) },
      });
      check(
        'thêm món vào giỏ trước khi quán ẩn món',
        addRes.status < 300 && (addRes.json?.data?.items?.length ?? 0) > 0,
        `nhận ${addRes.status} ${JSON.stringify(addRes.json)}`,
      );
      await call(`/api/seller/food-items/${item.id}`, {
        token: ownerToken,
        method: 'PATCH',
        body: { isAvailable: false },
      });
      const hiddenCheckout = await call('/api/orders/food/checkout', {
        token: tokens.buyer,
        method: 'POST',
        body: {
          addressId: addresses[0].id,
          phone: '0900000001',
          paymentMethod: 'cash',
          idempotencyKey: crypto.randomUUID(),
        },
      });
      check(
        'checkout món đã ẩn → 409 ITEM_UNAVAILABLE',
        hiddenCheckout.status === 409 && hiddenCheckout.json?.error?.code === 'ITEM_UNAVAILABLE',
        `nhận ${hiddenCheckout.status} ${JSON.stringify(hiddenCheckout.json)}`,
      );
      // Trả lại trạng thái ban đầu để không làm bẩn dữ liệu demo.
      await call(`/api/seller/food-items/${item.id}`, {
        token: ownerToken,
        method: 'PATCH',
        body: { isAvailable: true },
      });
      await call('/api/cart', { token: tokens.buyer, method: 'DELETE' });
    }
  } else {
    console.log('  SKIP  thiếu món hoặc địa chỉ');
  }

  console.log('10. Luồng giặt đầy đủ pending → completed (trước đây tắc ở picked_up)');
  const service = (await call('/api/catalog/laundry')).json?.data?.[0];
  const addrList = (await call('/api/buyer/addresses', { token: tokens.buyer })).json?.data ?? [];
  if (!service || addrList.length === 0) {
    console.log('  SKIP  thiếu dịch vụ giặt hoặc địa chỉ');
  } else {
    const created = await call('/api/orders/laundry', {
      token: tokens.buyer,
      method: 'POST',
      body: {
        serviceId: service.id,
        estimatedQty: 3,
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
        pickupAddressId: addrList[0].id,
        returnAddressId: addrList[0].id,
        phone: '0900000001',
        paymentMethod: 'cash',
      },
    });
    check('tạo đơn giặt → 2xx', created.status < 300, `nhận ${created.status} ${JSON.stringify(created.json)}`);
    const lid = created.json?.data?.id;

    let laundrySeller = null;
    for (const key of ['sellerFood', 'sellerLaundry']) {
      const r = await call(`/api/orders/${lid}`, { token: tokens[key] });
      if (r.status === 200) laundrySeller = tokens[key];
    }

    if (lid && laundrySeller) {
      for (const status of ['accepted', 'picking_up', 'picked_up']) {
        const r = await call(`/api/orders/${lid}/status`, {
          token: laundrySeller,
          method: 'PATCH',
          body: { status },
        });
        check(`quán → ${status}`, r.status === 200, `nhận ${r.status} ${JSON.stringify(r.json)}`);
      }
      const quote = await call(`/api/orders/${lid}/laundry-quote`, {
        token: laundrySeller,
        method: 'POST',
        body: { actualQty: 3.5, unitPrice: 15000, surcharge: 5000, sellerNote: 'Có vết bẩn cứng' },
      });
      check(
        'quán gửi báo giá → waiting_price_confirmation',
        quote.status === 200 && quote.json?.data?.status === 'waiting_price_confirmation',
        `nhận ${quote.status} ${JSON.stringify(quote.json)}`,
      );
      const detail = (await call(`/api/orders/${lid}`, { token: tokens.buyer })).json?.data;
      check(
        'giá chốt = qty × đơn giá + phụ phí',
        Number(detail?.laundry?.finalPrice) === 3.5 * 15000 + 5000,
        `finalPrice = ${detail?.laundry?.finalPrice}`,
      );

      const confirm = await call(`/api/orders/${lid}/confirm-price`, { token: tokens.buyer, method: 'POST' });
      check('khách chốt giá → washing', confirm.json?.data?.status === 'washing', `nhận ${confirm.status} ${JSON.stringify(confirm.json)}`);

      for (const status of ['returning', 'completed']) {
        const r = await call(`/api/orders/${lid}/status`, {
          token: laundrySeller,
          method: 'PATCH',
          body: { status },
        });
        check(`quán → ${status}`, r.status === 200, `nhận ${r.status} ${JSON.stringify(r.json)}`);
      }
    } else {
      console.log('  SKIP  không tạo được đơn giặt hoặc không tìm được quán');
    }
  }

  console.log(`\nKết quả: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Lỗi khi chạy smoke test:', err.message);
  process.exit(1);
});
