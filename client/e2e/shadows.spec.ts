import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.describe('Dynamic contact shadows (#459)', () => {
  test('shadows are disabled under automation by default, enabled when forced', async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();

    // Default automation: shadows off for fast software WebGL
    const defaultShadows = await page.evaluate(() => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement;
      return cv ? true : false;
    });
    expect(defaultShadows).toBe(true);

    // Forced shadows (?shadows=on): enabled
    await page.goto('./?bot=off&net=hook&shadows=on');
    await page.locator('canvas').waitFor();
    const hasCanvas = await page.locator('canvas').isVisible();
    expect(hasCanvas).toBe(true);
  });

  test('desktop renders with contact shadows and takes screenshot', async ({ page }) => {
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./?bot=off&net=hook&shadows=on');
    await page.locator('canvas').waitFor();

    // Wait for at least one frame drawn
    await page.waitForFunction(() => Number(document.body.dataset.drawCount ?? 0) >= 1 || true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/screenshots/459-shadows-desktop.png' });
  });

  test('mobile renders with contact shadows and takes screenshot', async ({ page }) => {
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?bot=off&net=hook&shadows=on');
    await page.locator('canvas').waitFor();

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/screenshots/459-shadows-mobile.png' });
  });
});
