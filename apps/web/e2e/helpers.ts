import { expect, type Page } from '@playwright/test';

const BUYER = { email: 'buyer@hcmut.edu.vn', password: 'Demo1234' };

export async function loginAsBuyer(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(BUYER.email);
  await page.getByLabel('Mật khẩu').fill(BUYER.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login$/);
}

export async function clearCart(page: Page) {
  const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';
  await page.request.delete(`${apiBase}/api/cart`);
}
