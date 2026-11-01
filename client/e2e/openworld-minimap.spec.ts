import { expect, test, type Page } from '@playwright/test';

// #1410: the minimap sits in the top right corner of the Open world, clear of the settings cog, and is drawn on a step and a turn.
const sizes = [
  { name: 'desktop 1280 by 720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: 'upright phone 390 by 844', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape phone 844 by 390', viewport: { width: 844, height: 390 }, touch: true },
];

/** A hash of the canvas pixels. */
const pixels = (page: Page): Promise<string> => page.evaluate(() => document.querySelector<HTMLCanvasElement>('#openworld-minimap')!.toDataURL());

for (const { name, viewport, touch } of sizes) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch });

    test('is in the top right corner under the cog, over no button', async ({ page }) => {
      await page.goto('./?bot=off&openworld=7');
      await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
      const map = page.locator('#openworld-minimap');
      await expect(map).toBeVisible();
      const box = (await map.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.x + box.width).toBeGreaterThan(viewport.width - 24);
      const cog = (await page.locator('#settings').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(cog.y + cog.height);
      for (const selector of ['#openworld-ship', '#openworld-hud', '#openworld-chip', '#settings']) {
        const other = await page.locator(selector).boundingBox();
        if (!other) continue; // not shown here
        const apart = box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y;
        expect(apart, selector).toBe(true);
      }
      await page.screenshot({ path: `test-results/minimap-${name.replaceAll(' ', '-')}.png` });
    });
  });
}

test('is redrawn when the hero steps and when the camera turns, and is gone when the mode is left', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
  const first = await pixels(page);
  await page.keyboard.press('q');
  await expect.poll(() => pixels(page)).not.toBe(first);
  const turned = await pixels(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pixels(page)).not.toBe(turned);
  await page.keyboard.press('Escape');
  await expect(page.locator('#openworld-minimap')).toBeHidden();
});
