import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.describe('Settings menu clipping (#458)', () => {
  test('every settings menu item is fully visible and not clipped or truncated on desktop', async ({ page }) => {
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();

    const cog = page.locator('#settings');
    await expect(cog).toBeEnabled();
    await cog.click();

    const menu = page.locator('#settings-menu');
    await expect(menu).toBeVisible();

    // Verify every button in the settings menu is fully on-screen and not truncated
    const buttons = menu.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const isVisible = await btn.isVisible();
      if (!isVisible) continue;

      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      // Button must not be clipped on the left of viewport
      expect(box!.x).toBeGreaterThanOrEqual(0);
      // Button must not overflow past viewport right edge
      expect(box!.x + box!.width).toBeLessThanOrEqual(1280);

      // Button contents should not overflow horizontally (no truncation)
      const overflows = await btn.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      const id = await btn.getAttribute('id');
      const text = await btn.innerText();
      expect(overflows, `button ${id} ("${text}") contents overflow: scrollWidth > clientWidth`).toBe(false);
    }

    await page.screenshot({ path: 'test-results/screenshots/458-settings-desktop.png' });
  });

  test('settings menu is fully visible and on-screen on phone landscape', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();

    const cog = page.locator('#settings');
    await expect(cog).toBeEnabled();
    await cog.click();

    const menu = page.locator('#settings-menu');
    await expect(menu).toBeVisible();

    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(844);

    await page.screenshot({ path: 'test-results/screenshots/458-settings-phone.png' });
  });
});
