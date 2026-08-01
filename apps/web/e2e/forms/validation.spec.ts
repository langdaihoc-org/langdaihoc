import { test, expect } from '@playwright/test';
import { API_URL, EMAILS, PASSWORD } from '../fixtures/creds';
import { apiLogin, prepareCartWithItem } from '../fixtures/api';

test.describe('form validation', () => {
  test('@smoke checkout place-order button stays disabled without a valid address', async ({
    page,
  }) => {
    // Chuẩn bị: login + giỏ có 1 món (qua API cho nhanh, cookie dùng chung)
    const login = await page.request.post(`${API_URL}/api/auth/login`, {
      data: { email: EMAILS.buyer, password: PASSWORD, rememberMe: false },
    });
    expect(login.status()).toBe(200);
    const ctx = await apiLogin(EMAILS.buyer);
    await prepareCartWithItem(ctx);
    await ctx.dispose();

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Xác nhận đơn hàng' })).toBeVisible();

    // Chuyển sang tab nhập mới (nếu có) để địa chỉ trống
    const manualTab = page.getByRole('button', { name: /Nhập mới/ });
    if (await manualTab.isVisible().catch(() => false)) {
      await manualTab.click();
    }
    await expect(page.getByRole('button', { name: /^Đặt hàng/ })).toBeDisabled();

    // Dọn giỏ
    await page.request.delete(`${API_URL}/api/cart`);
  });

  test('@smoke buyer register shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/auth/register/buyer');
    await page.getByRole('button', { name: 'Đăng ký' }).click();

    await expect(page.getByText('Email không hợp lệ')).toBeVisible();
    await expect(page.getByText('Bạn phải đồng ý điều khoản sử dụng')).toBeVisible();
    await expect(page.getByText('Bạn phải đồng ý chính sách bảo mật')).toBeVisible();
    // Không điều hướng đi đâu
    await expect(page).toHaveURL(/\/auth\/register\/buyer/);
  });

  test('@regression register rejects mismatched password confirmation', async ({ page }) => {
    await page.goto('/auth/register/buyer');
    await page.getByLabel('Họ và tên').fill('Nguyễn Văn Test');
    await page.getByLabel('Email').fill('qa-mismatch@example.com');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('Demo1234');
    await page.getByLabel('Xác nhận mật khẩu').fill('Demo9999');
    // Tick 2 checkbox đồng ý — zod .refine (so khớp mật khẩu) chỉ chạy khi schema gốc hợp lệ
    await page.getByLabel(/điều khoản sử dụng/).check();
    await page.getByLabel(/chính sách bảo mật/).check();
    await page.getByRole('button', { name: 'Đăng ký' }).click();

    await expect(page.getByText('Xác nhận mật khẩu không khớp')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/register\/buyer/);
  });
});
