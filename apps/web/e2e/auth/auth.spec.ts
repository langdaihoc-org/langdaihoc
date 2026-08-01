import { test, expect } from '@playwright/test';
import { API_URL, EMAILS, PASSWORD } from '../fixtures/creds';

/** Đăng nhập nhanh qua API — page.request dùng chung cookie jar với browser context. */
async function loginViaApi(page: import('@playwright/test').Page, email: string) {
  const res = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password: PASSWORD, rememberMe: false },
  });
  expect(res.status(), `login ${email}`).toBe(200);
}

test.describe('auth & guards', () => {
  test('@smoke @critical user can log in with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(EMAILS.buyer);
    await page.getByLabel('Mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page).not.toHaveURL(/\/auth\/login/);
    // Buyer home hiển thị điều hướng chính
    await expect(page.getByRole('link', { name: 'Ăn uống' }).first()).toBeVisible();
  });

  test('@smoke login with wrong password shows error and does not leak account existence', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(EMAILS.buyer);
    await page.getByLabel('Mật khẩu').fill('WrongPass123!');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Vẫn ở trang login, có thông báo lỗi chung chung
    await expect(page).toHaveURL(/\/auth\/login/);
    const alert = page.locator('form div.text-red-700').first();
    await expect(alert).toBeVisible();
    const text = (await alert.textContent()) ?? '';
    expect(text).not.toMatch(/không tồn tại|chưa đăng ký/i);
  });

  test('@smoke guest is redirected to login from protected pages', async ({ page }) => {
    for (const path of ['/checkout', '/orders', '/admin', '/seller']) {
      await page.goto(path);
      await expect(page, `guest → ${path}`).toHaveURL(/\/auth\/login/);
    }
  });

  test('@critical buyer cannot access admin or seller area', async ({ page }) => {
    await loginViaApi(page, EMAILS.buyer);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await page.goto('/seller');
    await expect(page).not.toHaveURL(/\/seller/);
  });

  test('@critical after logout, Back button does not reveal order data', async ({ page }) => {
    await loginViaApi(page, EMAILS.buyer);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /Đơn hàng/ }).first()).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Đăng xuất' }).first().click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.goBack();
    // ProtectedRoute phải đá về login, không hiển thị lại dữ liệu đơn
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(/Mã đơn/)).toHaveCount(0);
  });
});
