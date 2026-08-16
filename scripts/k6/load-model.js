/* eslint-disable */
/**
 * k6 — mo hinh tai cho langdaihoc.
 *
 * Ty le hanh vi lay tu code that, KHONG bia:
 *   - buyer pulse   : use-buyer-live.ts  -> 10s (pendingCount>0) / 15s (openCount>0) / 30s (yen)
 *   - seller pulse  : seller-shared.ts   -> 5s (pending|late|complaint > 0) / 15s (yen)
 *   - home          : home-page.tsx      -> catalog.home staleTime 60s + orders?view=summary
 *   - orders list   : orders-list-page.tsx (buyer, full view) / seller-orders-page.tsx (view=summary)
 *   - order detail  : GET /api/orders/:id
 *   - checkout      : POST /api/orders/food/checkout   (co Idempotency-Key)
 *   - transition    : PATCH /api/orders/:id/status
 *
 * CHAY:
 *   # 1) smoke an toan tren PRODUCTION (chi doc, ~2 req/s, 60s)
 *   k6 run -e BASE_URL=https://api-production-65ce.up.railway.app -e MODE=smoke scripts/k6/load-model.js
 *
 *   # 2) tai dinh gio cao diem (CHI chay tren moi truong khong phai prod, hoac ngoai gio)
 *   k6 run -e BASE_URL=... -e MODE=peak -e WRITE=1 \
 *          -e BUYERS='[{"identifier":"loadtest1@x.vn","password":"..."}]' \
 *          -e SELLERS='[{"identifier":"shop1@x.vn","password":"..."}]' \
 *          -e ADDRESS_ID=<uuid dia chi cua buyer test> \
 *          -e FOOD_ITEM_ID=<uuid mon test> \
 *          scripts/k6/load-model.js
 *
 * BAY QUAN TRONG khi ban tai tu 1 may:
 *   anonymousFloodLimiter = 6.000 req/phut/IP (= 100 req/s), chinh duoc bang bien
 *   moi truong ANON_RATE_LIMIT_PER_MIN tren Railway ma khong can deploy.
 *   Limiter CHI bo qua request co phien THAT (access token doc duoc, con han) —
 *   cookie bia khong bo qua duoc nua. Vi vay:
 *     - kich ban co dang nhap (VU giu cookie that sau khi login) khong bi tinh;
 *     - kich ban an danh (catalog) van nen giu duoi ~80 req/s de con bien an toan;
 *     - neu can ban an danh manh hon, tam nang ANON_RATE_LIMIT_PER_MIN roi TRA LAI.
 */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ----------------------------------------------------------------- cau hinh
const BASE = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const ORIGIN = __ENV.ORIGIN || 'https://langdaihoc.xyz'; // csrf-origin.ts bat buoc voi POST/PATCH
const MODE = (__ENV.MODE || 'smoke').toLowerCase(); // smoke | peak | soak
const WRITE = __ENV.WRITE === '1' && MODE !== 'smoke'; // smoke KHONG BAO GIO ghi
const ADDRESS_ID = __ENV.ADDRESS_ID || '';
const FOOD_ITEM_ID = __ENV.FOOD_ITEM_ID || '';

const buyers = new SharedArray('buyers', () => JSON.parse(__ENV.BUYERS || '[]'));
const sellers = new SharedArray('sellers', () => JSON.parse(__ENV.SELLERS || '[]'));

/**
 * Ty le req/s o dinh (11h15-11h30), suy ra tu mo hinh:
 *   10.000 don/ngay, 45% roi vao trua, 25% cua trua don vao 15 phut cao nhat
 *   -> 1,25 don/s; Little's law (W = 12 phut) -> ~900 phien co don dang mo
 *   + ~1.350 phien dang xem  => ~2.250 tab mo.
 * Tu do nhan voi nhip poll that trong code.
 */
const PEAK = {
  buyerPulseOpen: 60, // 900 buyer co don mo x 4 lan/phut (15s)
  buyerPulseIdle: 45, // 1.350 buyer yen x 2 lan/phut (30s)
  sellerPulse: 12, // 60 quan x 12 lan/phut (5s)
  catalog: 15, // duyet trang chu / danh muc
  buyerList: 8, // mo tab don cua khach
  sellerList: 6, // list quan tai lai khi fingerprint doi
  cart: 5,
  orderDetail: 4,
  transition: 5, // 4 buoc/don x 1,25 don/s
  checkout: 1.25,
};

/** He so thu nho theo MODE. smoke = doc rat nhe, an toan cho prod. */
const SCALE = MODE === 'smoke' ? 0.012 : MODE === 'soak' ? 0.25 : 1;
const DURATION = MODE === 'smoke' ? '60s' : MODE === 'soak' ? '30m' : '5m';

function rate(base) {
  const r = base * SCALE;
  return Math.max(1, Math.round(r * 60)); // req/phut, toi thieu 1
}

// ----------------------------------------------------------------- metrics
const errors = new Rate('ldh_errors');
const rateLimited = new Counter('ldh_429');
const pulseLatency = new Trend('ldh_pulse_ms', true);
const listLatency = new Trend('ldh_list_ms', true);
const checkoutLatency = new Trend('ldh_checkout_ms', true);
const ordersCreated = new Counter('ldh_orders_created');

// ----------------------------------------------------------------- kich ban
function scenario(name, ratePerMin, fn, startVUs) {
  return {
    executor: 'constant-arrival-rate',
    exec: fn,
    rate: ratePerMin,
    timeUnit: '1m',
    duration: DURATION,
    preAllocatedVUs: startVUs,
    maxVUs: startVUs * 4,
    tags: { flow: name },
    gracefulStop: '30s',
  };
}

const readScenarios = {
  catalog: scenario('catalog', Math.min(rate(PEAK.catalog), MODE === 'smoke' ? 60 : 1e9), 'flowCatalog', 10),
};

const authedScenarios = {
  buyerPulseOpen: scenario('buyer_pulse_open', rate(PEAK.buyerPulseOpen), 'flowBuyerPulse', 20),
  buyerPulseIdle: scenario('buyer_pulse_idle', rate(PEAK.buyerPulseIdle), 'flowBuyerPulse', 15),
  sellerPulse: scenario('seller_pulse', rate(PEAK.sellerPulse), 'flowSellerPulse', 8),
  buyerList: scenario('buyer_list', rate(PEAK.buyerList), 'flowBuyerList', 8),
  sellerList: scenario('seller_list', rate(PEAK.sellerList), 'flowSellerList', 8),
  cart: scenario('cart', rate(PEAK.cart), 'flowCart', 5),
  orderDetail: scenario('order_detail', rate(PEAK.orderDetail), 'flowOrderDetail', 5),
};

const writeScenarios = {
  checkout: scenario('checkout', rate(PEAK.checkout), 'flowCheckout', 5),
  transition: scenario('transition', rate(PEAK.transition), 'flowTransition', 5),
};

export const options = {
  discardResponseBodies: false,
  scenarios: Object.assign(
    {},
    readScenarios,
    buyers.length || sellers.length ? authedScenarios : {},
    WRITE && buyers.length && sellers.length ? writeScenarios : {},
  ),
  thresholds: {
    // --- suc khoe chung ---
    ldh_errors: ['rate<0.01'],
    // 429 la tin hieu ban dang tu bop chinh minh (1 IP), khong phai loi server.
    ldh_429: ['count<10'],

    // --- do tre theo luong ---
    // Pulse la 1 truy van + auth cache; RTT Railway(hkg1)->Supabase(sin1) ~45ms.
    'http_req_duration{flow:buyer_pulse_open}': ['p(95)<600', 'p(99)<1200'],
    'http_req_duration{flow:seller_pulse}': ['p(95)<600', 'p(99)<1200'],
    // catalog gan nhu luon HIT micro-cache 15s -> phai rat nhanh
    'http_req_duration{flow:catalog}': ['p(95)<500'],
    // list buyer ~6-8 truy van, list seller ~10-13 truy van
    'http_req_duration{flow:buyer_list}': ['p(95)<1500'],
    'http_req_duration{flow:seller_list}': ['p(95)<2500'],
    'http_req_duration{flow:order_detail}': ['p(95)<1500'],
    'http_req_duration{flow:cart}': ['p(95)<1200'],
    // checkout = ~25 luot di-ve DB noi tiep trong 1 transaction
    'http_req_duration{flow:checkout}': ['p(95)<4000'],
    'http_req_duration{flow:transition}': ['p(95)<3000'],

    // --- chan hoi quy ---
    http_req_failed: ['rate<0.02'],
  },
};

// ----------------------------------------------------------------- tro giup
function headers(extra) {
  return Object.assign({ Origin: ORIGIN, Accept: 'application/json' }, extra || {});
}

function jsonHeaders(extra) {
  return headers(Object.assign({ 'Content-Type': 'application/json' }, extra || {}));
}

/** Dang nhap 1 lan cho moi VU; cookie nam trong jar cua VU nen moi request sau deu co phien. */
const sessionCache = {};

function login(pool, label) {
  if (!pool.length) fail(`Thieu tai khoan ${label} — truyen -e ${label.toUpperCase()}S='[...]'`);
  const key = `${label}:${exec.vu.idInInstance}`;
  if (sessionCache[key]) return sessionCache[key];

  const cred = pool[exec.vu.idInInstance % pool.length];
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ identifier: cred.identifier, password: cred.password, rememberMe: true }),
    { headers: jsonHeaders(), tags: { flow: 'login' } },
  );
  if (res.status !== 200) {
    fail(`Dang nhap ${label} that bai: ${res.status} ${String(res.body).slice(0, 200)}`);
  }
  const body = res.json();
  sessionCache[key] = { userId: body && body.user ? body.user.id : null, role: label };
  return sessionCache[key];
}

function track(res, trend) {
  const ok = res.status >= 200 && res.status < 300;
  errors.add(!ok);
  if (res.status === 429) rateLimited.add(1);
  if (trend) trend.add(res.timings.duration);
  return ok;
}

// ----------------------------------------------------------------- cac luong
/** An danh: mo trang chu. GET /api/catalog/home = 7 truy van khi MISS, 0 khi HIT. */
export function flowCatalog() {
  const res = http.get(`${BASE}/api/catalog/home`, { headers: headers(), tags: { flow: 'catalog' } });
  track(res);
  check(res, {
    'home 200': (r) => r.status === 200,
    'home co du lieu': (r) => {
      try {
        return !!r.json('data');
      } catch (_) {
        return false;
      }
    },
  });
}

export function flowBuyerPulse() {
  login(buyers, 'buyer');
  const res = http.get(`${BASE}/api/orders/pulse`, { headers: headers(), tags: { flow: 'buyer_pulse' } });
  track(res, pulseLatency);
  check(res, { 'pulse 200': (r) => r.status === 200 });
}

export function flowSellerPulse() {
  login(sellers, 'seller');
  const res = http.get(`${BASE}/api/orders/pulse`, { headers: headers(), tags: { flow: 'seller_pulse' } });
  track(res, pulseLatency);
  check(res, { 'pulse seller 200': (r) => r.status === 200 });
}

/** Buyer mo tab don — view day du (khong summary), giong orders-list-page.tsx. */
export function flowBuyerList() {
  login(buyers, 'buyer');
  const scope = ['active', 'done'][randomIntBetween(0, 1)];
  const res = http.get(`${BASE}/api/orders?page=1&limit=10&scope=${scope}`, {
    headers: headers(),
    tags: { flow: 'buyer_list' },
  });
  track(res, listLatency);
  check(res, { 'buyer list 200': (r) => r.status === 200 });
}

/** Seller mo tab don — view=summary, giong seller-orders-page.tsx. */
export function flowSellerList() {
  login(sellers, 'seller');
  const scope = ['active', 'delivering', 'done'][randomIntBetween(0, 2)];
  const res = http.get(`${BASE}/api/orders?page=1&limit=20&scope=${scope}&view=summary`, {
    headers: headers(),
    tags: { flow: 'seller_list' },
  });
  track(res, listLatency);
  check(res, { 'seller list 200': (r) => r.status === 200 });
}

export function flowCart() {
  login(buyers, 'buyer');
  const res = http.get(`${BASE}/api/cart`, { headers: headers(), tags: { flow: 'cart' } });
  track(res);
  check(res, { 'cart 200': (r) => r.status === 200 });
}

export function flowOrderDetail() {
  login(buyers, 'buyer');
  const list = http.get(`${BASE}/api/orders?page=1&limit=5&scope=all&view=summary`, {
    headers: headers(),
    tags: { flow: 'order_detail_list' },
  });
  if (list.status !== 200) {
    track(list);
    return;
  }
  let rows = [];
  try {
    rows = list.json('data') || [];
  } catch (_) {
    rows = [];
  }
  if (!rows.length) return; // tai khoan chua co don — bo qua, khong tinh loi
  const id = rows[randomIntBetween(0, rows.length - 1)].id;
  const res = http.get(`${BASE}/api/orders/${id}`, { headers: headers(), tags: { flow: 'order_detail' } });
  track(res, listLatency);
  check(res, { 'detail 200': (r) => r.status === 200 });
}

/**
 * GHI — chi chay khi WRITE=1. Tao don that.
 * Luu y createOrderLimiter = 20 don/5 phut/IP o prod: tu 1 may ban se cham tran
 * o ~0,067 don/s. Muon do dung 1,25 don/s phai chay phan tan hoac noi limiter.
 */
export function flowCheckout() {
  login(buyers, 'buyer');
  if (!ADDRESS_ID || !FOOD_ITEM_ID) fail('Can -e ADDRESS_ID va -e FOOD_ITEM_ID cho kich ban ghi');

  const add = http.post(
    `${BASE}/api/cart/items`,
    JSON.stringify({ foodItemId: FOOD_ITEM_ID, quantity: 1 }),
    { headers: jsonHeaders(), tags: { flow: 'cart_add' } },
  );
  if (!track(add)) return;

  const key = `k6-${exec.scenario.iterationInTest}-${exec.vu.idInInstance}-${Date.now()}`;
  const res = http.post(
    `${BASE}/api/orders/food/checkout`,
    JSON.stringify({
      addressId: ADDRESS_ID,
      phone: '0900000000',
      paymentMethod: 'cash',
      notes: 'k6 load test',
    }),
    { headers: jsonHeaders({ 'Idempotency-Key': key }), tags: { flow: 'checkout' } },
  );
  track(res, checkoutLatency);
  if (res.status === 201 || res.status === 200) ordersCreated.add(1);
  check(res, { 'checkout tao don': (r) => r.status === 200 || r.status === 201 });
}

/** GHI — seller day 1 don pending sang accepted. */
export function flowTransition() {
  login(sellers, 'seller');
  const list = http.get(`${BASE}/api/orders?page=1&limit=20&scope=active&view=summary`, {
    headers: headers(),
    tags: { flow: 'transition_list' },
  });
  if (list.status !== 200) {
    track(list);
    return;
  }
  let rows = [];
  try {
    rows = list.json('data') || [];
  } catch (_) {
    rows = [];
  }
  const pending = rows.filter((o) => o.status === 'pending');
  if (!pending.length) return;
  const target = pending[randomIntBetween(0, pending.length - 1)];
  const res = http.patch(
    `${BASE}/api/orders/${target.id}/status`,
    JSON.stringify({ status: 'accepted' }),
    { headers: jsonHeaders(), tags: { flow: 'transition' } },
  );
  track(res, listLatency);
  check(res, { 'transition ok': (r) => r.status === 200 || r.status === 409 });
}

// ----------------------------------------------------------------- setup
export function setup() {
  const h = http.get(`${BASE}/api/health`, { headers: headers() });
  if (h.status !== 200) fail(`API khong song: ${BASE}/api/health -> ${h.status}`);
  const ready = http.get(`${BASE}/api/health/ready`, { headers: headers() });
  console.log(
    `MODE=${MODE} WRITE=${WRITE} SCALE=${SCALE} health=${h.status} ready=${ready.status} ` +
      `buyers=${buyers.length} sellers=${sellers.length}`,
  );
  if (MODE === 'smoke') {
    console.log('SMOKE: chi doc, ~2 req/s, an toan chay tren production.');
  }
  return { startedAt: Date.now() };
}

export function teardown(data) {
  console.log(`Xong sau ${Math.round((Date.now() - data.startedAt) / 1000)}s`);
}

export function handleSummary(data) {
  const m = data.metrics;
  const get = (name, stat) => (m[name] && m[name].values ? m[name].values[stat] : undefined);
  const lines = [
    '',
    '=== langdaihoc load model ===',
    `mode            : ${MODE} (scale ${SCALE}, write ${WRITE})`,
    `requests        : ${get('http_reqs', 'count') || 0}`,
    `req/s dat duoc  : ${(get('http_reqs', 'rate') || 0).toFixed(2)}`,
    `loi (ldh_errors): ${((get('ldh_errors', 'rate') || 0) * 100).toFixed(2)}%`,
    `429 (tu bop IP) : ${get('ldh_429', 'count') || 0}`,
    `pulse p95       : ${(get('ldh_pulse_ms', 'p(95)') || 0).toFixed(0)} ms`,
    `list p95        : ${(get('ldh_list_ms', 'p(95)') || 0).toFixed(0)} ms`,
    `checkout p95    : ${(get('ldh_checkout_ms', 'p(95)') || 0).toFixed(0)} ms`,
    `don da tao      : ${get('ldh_orders_created', 'count') || 0}`,
    '',
  ];
  return { stdout: lines.join('\n') };
}
