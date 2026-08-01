import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const PAGES = ['/', '/food', '/laundry', '/auth/login'] as const;

test.describe('responsive layout', () => {
  for (const vp of VIEWPORTS) {
    test(`@smoke no horizontal overflow at ${vp.name} (${vp.width}×${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} tràn ngang ${overflow}px ở ${vp.name}`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('@smoke tablet (md–lg) still has bottom navigation — no nav gap', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/');
    // Top nav chỉ hiện từ lg (1024px) nên bottom nav phải còn sống ở tablet
    for (const label of ['Trang chủ', 'Ăn uống', 'Giặt', 'Đơn']) {
      await expect(
        page.getByRole('link', { name: label, exact: true }).first(),
        `tab "${label}" phải hiển thị ở tablet`,
      ).toBeVisible();
    }
  });

  test('@smoke mobile header actions hug the right edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const gap = await page.evaluate(() => {
      const header = document.querySelector('header');
      const account =
        header?.querySelector('button[aria-label="Tài khoản"], a[href="/auth/login"]') ??
        null;
      if (!header || !account) return -1;
      const hr = header.getBoundingClientRect();
      const ar = account.getBoundingClientRect();
      // khoảng trống mép phải sau nút tài khoản / đăng nhập
      return hr.right - ar.right;
    });

    expect(gap, 'nút tài khoản phải sát mép phải header').toBeGreaterThanOrEqual(0);
    expect(gap, `còn ${gap}px trống bên phải — chưa lệch phải`).toBeLessThanOrEqual(28);
  });

  test('@smoke mobile bottom navigation shows all 6 tabs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    for (const label of ['Trang chủ', 'Khám phá', 'Ăn uống', 'Giặt', 'Ship hộ', 'Đơn']) {
      await expect(
        page.getByRole('link', { name: label, exact: true }).first(),
        `tab "${label}" phải hiển thị`,
      ).toBeVisible();
    }
  });
});
