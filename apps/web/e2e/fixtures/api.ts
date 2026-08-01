import { request, expect, type APIRequestContext } from '@playwright/test';
import { API_URL, PASSWORD } from './creds';

/** Đăng nhập qua API, trả về request context giữ cookie phiên. Nhớ dispose() sau khi dùng. */
export async function apiLogin(email: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/auth/login', {
    data: { email, password: PASSWORD, rememberMe: false },
  });
  expect(res.status(), `login ${email} → ${await res.text()}`).toBe(200);
  return ctx;
}

type OptionGroup = {
  id: string;
  required: boolean;
  minSelect: number;
  options: { id: string }[];
};

export type CatalogFoodItem = {
  id: string;
  sellerId: string;
  shopName: string;
  name: string;
  price: number;
  optionGroups: OptionGroup[];
};

/** Option bắt buộc tối thiểu để món add-to-cart hợp lệ. */
export function requiredOptions(item: CatalogFoodItem): { id: string }[] {
  const picked: { id: string }[] = [];
  for (const g of item.optionGroups ?? []) {
    if (g.id === 'optional' || !g.required) continue;
    const need = Math.max(1, g.minSelect ?? 1);
    picked.push(...g.options.slice(0, need).map((o) => ({ id: o.id })));
  }
  return picked;
}

export async function getFoodItems(ctx: APIRequestContext): Promise<CatalogFoodItem[]> {
  const res = await ctx.get('/api/catalog/food?limit=50');
  expect(res.ok(), 'GET /api/catalog/food').toBeTruthy();
  const json = await res.json();
  return json.data as CatalogFoodItem[];
}

export async function getDefaultAddressId(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.get('/api/buyer/addresses');
  expect(res.ok(), 'GET /api/buyer/addresses').toBeTruthy();
  const { data } = await res.json();
  expect(Array.isArray(data) && data.length > 0, 'buyer cần có ít nhất 1 địa chỉ seed').toBeTruthy();
  return data[0].id as string;
}

/** Xóa giỏ rồi thêm 1 món (kèm option bắt buộc). Trả về món đã thêm. */
export async function prepareCartWithItem(ctx: APIRequestContext): Promise<CatalogFoodItem> {
  const items = await getFoodItems(ctx);
  expect(items.length, 'catalog food phải có món').toBeGreaterThan(0);
  const item = items[0];
  await ctx.delete('/api/cart');
  const res = await ctx.post('/api/cart/items', {
    data: { foodItemId: item.id, quantity: 1, options: requiredOptions(item), forceClear: true },
  });
  expect(res.ok(), `add to cart → ${await res.text()}`).toBeTruthy();
  return item;
}

export async function checkoutFood(
  ctx: APIRequestContext,
  opts: { addressId: string; idempotencyKey?: string; paymentMethod?: 'cash' | 'bank_transfer' },
) {
  return ctx.post('/api/orders/food/checkout', {
    data: {
      addressId: opts.addressId,
      phone: '0901234567',
      paymentMethod: opts.paymentMethod ?? 'cash',
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    },
  });
}

export async function expectApiError(
  res: Awaited<ReturnType<APIRequestContext['post']>>,
  status: number | number[],
  code?: string,
) {
  const statuses = Array.isArray(status) ? status : [status];
  const body = await res.text();
  expect(statuses, `expected ${statuses} got ${res.status()}: ${body}`).toContain(res.status());
  if (code) expect(body).toContain(code);
}
