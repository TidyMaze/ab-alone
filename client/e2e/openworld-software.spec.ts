import { expect, test } from '@playwright/test';

// #1483: a page with no GPU (here forced with ?software=on, the CI runner says it by itself) takes the low tier and draws the ground in
// view only: the whole loaded square is about 178 000 triangles, the screen's share about a third of it.
test('a software page takes the low tier and draws the ground in view only in the Open world, #1483', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7&software=on');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  await expect(page.locator('body')).toHaveAttribute('data-software', 'on');
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'low');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __renderCost: { triangles: number } }).__renderCost.triangles), { timeout: 8000 })
    .toBeGreaterThan(1000);
  const { triangles } = await page.evaluate(() => (window as unknown as { __renderCost: { triangles: number } }).__renderCost);
  expect(triangles).toBeLessThan(100000);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,0');
});
