import { test, expect } from '@playwright/test';

test.describe('smoke: buyer food flow', () => {
  test('login → browse food catalog', async ({ page }) => {
    await page.goto('/auth/login');

    await page.getByLabel('Email').fill('buyer@hcmut.edu.vn');
    await page.getByLabel('Mật khẩu').fill('Demo1234');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page).not.toHaveURL(/\/auth\/login$/);
    await page.goto('/food');

    await expect(page.getByRole('heading', { name: 'Ăn uống' })).toBeVisible();
    await expect(page.getByText(/\d+\s*quán/i).first()).toBeVisible();
    await expect(page.getByText(/món/i).first()).toBeVisible();
  });
});
