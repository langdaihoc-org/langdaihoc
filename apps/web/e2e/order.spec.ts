import { test, expect } from '@playwright/test';
import { clearCart, loginAsBuyer } from './helpers';

test.describe('food order flow', () => {
  test('login → thêm món → checkout → xem đơn', async ({ page }) => {
    await loginAsBuyer(page);
    await clearCart(page);

    await page.goto('/food');
    await page.getByRole('link', { name: 'Cơm Sinh Viên' }).first().click();
    await expect(page).toHaveURL(/\/store\//);

    await page.getByRole('button', { name: 'Chọn Trà đào' }).click();
    await page.getByRole('button', { name: /Thêm giỏ|Thêm vào giỏ/ }).click();

    await page.goto('/cart');
    await expect(page.getByText('Trà đào')).toBeVisible();
    await page.getByRole('button', { name: 'Tiến hành đặt hàng' }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Xác nhận đơn hàng' })).toBeVisible();

    // Chọn địa chỉ đã lưu (mặc định có thể đang ở tab Nhập mới)
    const savedTab = page.getByRole('button', { name: 'Đã lưu' });
    if (await savedTab.isVisible()) {
      await savedTab.click();
    }
    const savedAddr = page.locator('button').filter({ hasText: /090|KTX|tòa|rào/i }).first();
    if (await savedAddr.isVisible().catch(() => false)) {
      await savedAddr.click();
    }

    const placeOrder = page.getByRole('button', { name: /^Đặt hàng/ });
    await expect(placeOrder).toBeEnabled({ timeout: 10_000 });
    await placeOrder.click();

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/i, { timeout: 15_000 });
    await expect(page.getByText(/Mã đơn:\s*FD-/)).toBeVisible();
    await expect(page.getByText('Chờ xác nhận').first()).toBeVisible();
  });
});
