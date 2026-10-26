import { expect, test } from '@playwright/test';

test.describe('Dynamic contact shadows (#459)', () => {
  test('shadows are off under automation by default', async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await expect(page.locator('body')).toHaveAttribute('data-shadows', 'off');
  });

  test('shadows are on when forced with ?shadows=on, on desktop and on a phone', async ({ page }) => {
    for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto('./?bot=off&net=hook&shadows=on');
      await expect(page.locator('body')).toHaveAttribute('data-shadows', 'on');
      await expect(page.locator('canvas')).toBeVisible();
    }
  });
});
