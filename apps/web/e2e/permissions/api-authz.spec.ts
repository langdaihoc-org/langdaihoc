import { test, expect, type APIRequestContext } from '@playwright/test';
import { EMAILS } from '../fixtures/creds';
import {
  apiLogin,
  prepareCartWithItem,
  getDefaultAddressId,
  checkoutFood,
  expectApiError,
} from '../fixtures/api';

/**
 * Kiểm thử phân quyền & idempotency trực tiếp ở tầng API —
 * đảm bảo không thể vượt quyền bằng cách gọi API tay.
 */
test.describe('API authorization & idempotency', () => {
  let buyer: APIRequestContext;

  test.beforeAll(async () => {
    buyer = await apiLogin(EMAILS.buyer);
  });

  test.afterAll(async () => {
    await buyer.delete('/api/cart').catch(() => {});
    await buyer.dispose();
  });

  test('@critical checkout without Idempotency-Key returns 400', async () => {
    await prepareCartWithItem(buyer);
    const addressId = await getDefaultAddressId(buyer);
    const res = await checkoutFood(buyer, { addressId });
    await expectApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED');
    await buyer.delete('/api/cart');
  });

  test('@critical duplicate checkout with same Idempotency-Key creates only one order', async () => {
    await prepareCartWithItem(buyer);
    const addressId = await getDefaultAddressId(buyer);
    const key = crypto.randomUUID();

    const first = await checkoutFood(buyer, { addressId, idempotencyKey: key });
    expect(first.status(), await first.text()).toBe(201);
    const orderA = (await first.json()).data;

    const second = await checkoutFood(buyer, { addressId, idempotencyKey: key });
    expect([200, 201]).toContain(second.status());
    const orderB = (await second.json()).data;
    expect(orderB.id, 'cùng key phải trả về cùng một đơn').toBe(orderA.id);
  });

  test('@critical foreign seller cannot transition another shop order', async () => {
    // Tạo đơn thuộc seller của món đầu catalog
    const item = await prepareCartWithItem(buyer);
    const addressId = await getDefaultAddressId(buyer);
    const res = await checkoutFood(buyer, { addressId, idempotencyKey: crypto.randomUUID() });
    expect(res.status(), await res.text()).toBe(201);
    const order = (await res.json()).data;

    // Chọn seller KHÔNG sở hữu đơn
    const foreignEmail =
      item.shopName === 'Cơm Sinh Viên' ? EMAILS.sellerFood2 : EMAILS.sellerBoth;
    const foreign = await apiLogin(foreignEmail);
    try {
      const patch = await foreign.patch(`/api/orders/${order.id}/status`, {
        data: { status: 'accepted' },
      });
      await expectApiError(patch, [403, 404]);
    } finally {
      await foreign.dispose();
    }
  });

  test('@critical buyer cannot change order status to seller-only state', async () => {
    const orders = await buyer.get('/api/orders');
    const { data } = await orders.json();
    const pending = (data as { id: string; status: string }[]).find((o) => o.status === 'pending');
    test.skip(!pending, 'không có đơn pending để thử');
    const res = await buyer.patch(`/api/orders/${pending!.id}/status`, {
      data: { status: 'accepted' },
    });
    await expectApiError(res, [403, 409, 422]);
  });

  test('@critical buyer cannot call admin API', async () => {
    for (const path of ['/api/admin/stats', '/api/admin/users', '/api/admin/sellers']) {
      const res = await buyer.get(path);
      await expectApiError(res, 403);
    }
  });

  test('@critical another user cannot modify my cart item (IDOR)', async () => {
    await prepareCartWithItem(buyer);
    const cart = await buyer.get('/api/cart');
    const cartItemId = (await cart.json()).data.items[0].id as string;

    const other = await apiLogin(EMAILS.otherUser);
    try {
      // 403 = chặn từ role guard, 404 = chặn từ ownership check — cả hai đều an toàn
      const patch = await other.patch(`/api/cart/items/${cartItemId}`, { data: { quantity: 99 } });
      await expectApiError(patch, [403, 404]);
      const del = await other.delete(`/api/cart/items/${cartItemId}`);
      await expectApiError(del, [403, 404]);
    } finally {
      await other.dispose();
    }

    // Số lượng của tôi không bị đổi
    const mine = await buyer.get('/api/cart');
    expect((await mine.json()).data.items[0].quantity).toBe(1);
    await buyer.delete('/api/cart');
  });

  test('@critical payment proof rejects external (non-uploaded) image URL', async () => {
    await prepareCartWithItem(buyer);
    const addressId = await getDefaultAddressId(buyer);
    const res = await checkoutFood(buyer, {
      addressId,
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: 'bank_transfer',
    });
    expect(res.status(), await res.text()).toBe(201);
    const order = (await res.json()).data;

    const proof = await buyer.post(`/api/orders/${order.id}/payment-proof`, {
      data: { imageUrl: 'https://evil.example.com/fake-receipt.jpg' },
    });
    await expectApiError(proof, 400);
  });
});
