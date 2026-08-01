import { test, expect, type APIRequestContext } from '@playwright/test';
import { EMAILS } from '../fixtures/creds';
import { apiLogin, getDefaultAddressId, expectApiError } from '../fixtures/api';

/**
 * Vòng đời đơn giặt đầy đủ (API-level):
 * đặt → nhận → lấy đồ → báo giá → buyer xác nhận → giặt → trả → hoàn tất.
 * Kèm kiểm tra: buyer không được tự báo giá.
 */
test.describe('laundry order lifecycle', () => {
  let buyer: APIRequestContext;
  let seller: APIRequestContext | null = null;

  test.afterAll(async () => {
    await buyer?.dispose();
    await seller?.dispose();
  });

  test('@critical full laundry flow: book → quote → confirm → complete', async () => {
    buyer = await apiLogin(EMAILS.buyer);

    // 1. Đặt dịch vụ giặt đầu tiên trong catalog
    const catalog = await buyer.get('/api/catalog/laundry');
    expect(catalog.ok()).toBeTruthy();
    const services = (await catalog.json()).data as { id: string; name: string }[];
    expect(services.length, 'catalog laundry phải có dịch vụ').toBeGreaterThan(0);

    const addressId = await getDefaultAddressId(buyer);
    const bookRes = await buyer.post('/api/orders/laundry', {
      data: {
        serviceId: services[0].id,
        estimatedQty: 3,
        pickupScheduledAt: new Date(Date.now() + 3600_000).toISOString(),
        pickupAddressId: addressId,
        returnAddressId: addressId,
        phone: '0901234567',
        paymentMethod: 'cash',
      },
    });
    expect(bookRes.status(), await bookRes.text()).toBe(201);
    const order = (await bookRes.json()).data as { id: string; status: string };
    expect(order.status).toBe('pending');

    // 2. Buyer KHÔNG được tự báo giá
    const buyerQuote = await buyer.post(`/api/orders/${order.id}/laundry-quote`, {
      data: { actualQty: 3, unitPrice: 10000 },
    });
    await expectApiError(buyerQuote, 403);

    // 3. Tìm seller sở hữu đơn (thử cả 2 seller giặt demo).
    // Seller xem đơn của mình qua GET /api/orders (role-scoped).
    for (const email of [EMAILS.sellerBoth, EMAILS.sellerLaundry3]) {
      const ctx = await apiLogin(email);
      const list = await ctx.get('/api/orders');
      expect(list.ok(), `GET /api/orders (${email})`).toBeTruthy();
      const found = ((await list.json()).data as { id: string }[]).some((o) => o.id === order.id);
      if (found) {
        seller = ctx;
        break;
      }
      await ctx.dispose();
    }
    expect(seller, 'phải tìm được seller sở hữu đơn giặt').not.toBeNull();

    // 4. Seller: accepted → picking_up → picked_up
    for (const status of ['accepted', 'picking_up', 'picked_up']) {
      const res = await seller!.patch(`/api/orders/${order.id}/status`, { data: { status } });
      expect(res.status(), `${status}: ${await res.text()}`).toBe(200);
    }

    // 5. Seller báo giá → waiting_price_confirmation
    const quote = await seller!.post(`/api/orders/${order.id}/laundry-quote`, {
      data: { actualQty: 3.5, unitPrice: 10000, surcharge: 5000, sellerNote: 'Đồ hơi nhiều' },
    });
    expect(quote.status(), await quote.text()).toBe(200);

    const afterQuote = await buyer.get(`/api/orders/${order.id}`);
    const detail = (await afterQuote.json()).data;
    expect(detail.order.status).toBe('waiting_price_confirmation');
    // Giá cuối = 3.5 × 10.000 + 5.000 — phải khớp cả order.total lẫn laundry.finalPrice
    expect(Number(detail.order.total)).toBe(40000);
    expect(Number(detail.laundry.finalPrice)).toBe(40000);

    // 6. Buyer xác nhận giá → washing
    const confirm = await buyer.post(`/api/orders/${order.id}/confirm-price`);
    expect(confirm.status(), await confirm.text()).toBe(200);
    expect((await confirm.json()).data.status).toBe('washing');

    // 7. Seller: returning → completed
    for (const status of ['returning', 'completed']) {
      const res = await seller!.patch(`/api/orders/${order.id}/status`, { data: { status } });
      expect(res.status(), `${status}: ${await res.text()}`).toBe(200);
    }

    const final = await buyer.get(`/api/orders/${order.id}`);
    expect((await final.json()).data.order.status).toBe('completed');
  });
});
