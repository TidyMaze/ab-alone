import { expect, test } from '@playwright/test';

// The old room never shows at the start (#1389): the canvas stays hidden until the terrace is drawn, on a plain dark page.
test('the canvas waits for the terrace files, then shows the terrace', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/slab-royale.glb', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('./?bot=off');
  await expect(page.locator('canvas')).toBeAttached();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'room'); // the terrace is still loading
  await page.waitForTimeout(500); // a few frames: the room would be drawn by now
  await page.screenshot({ path: 'test-results/boot-veil-during.png' });
  await expect(page.locator('canvas')).toHaveCSS('opacity', '0');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'table-zero');
  await expect(page.locator('canvas')).toHaveCSS('opacity', '1');
});

test('a terrace file that fails still shows the canvas', async ({ page }) => {
  await page.route('**/slab-royale.glb', (route) => route.abort());
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'table-zero');
  await expect(page.locator('canvas')).toHaveCSS('opacity', '1');
});

test('the room kept by ?scene=room shows at once', async ({ page }) => {
  await page.route('**/slab-royale.glb', (route) => route.abort());
  await page.goto('./?bot=off&scene=room');
  await expect(page.locator('canvas')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.body.dataset.scene)).toBe('room');
});
