import { test, expect } from '@playwright/test';

test.describe('auth lifecycle & 404', () => {
  test('@smoke forgot password page submits without leaking account existence', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Email').fill('buyer@hcmut.edu.vn');
    await page.getByRole('button', { name: /Gửi hướng dẫn|Đang xử lý/ }).click();
    await expect(page.getByText(/Nếu (email|tài khoản) tồn tại|đã gửi hướng dẫn|hướng dẫn đặt lại/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('@smoke unknown route shows 404 with home link', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
  });
});
