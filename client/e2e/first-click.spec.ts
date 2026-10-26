import { expect, test } from '@playwright/test';

// #237: a click that comes before the first frame must pick a cell. The frame loop is held back so the click
// is handled while no `renderer.render` has run, as on a fast cached load.
test('a click before the first frame is played', async ({ page }) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');

  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
});
