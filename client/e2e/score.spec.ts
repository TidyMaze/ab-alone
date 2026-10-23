import { expect, test } from '@playwright/test';

test('the HUD shows 0/6 for each side at the start, and still after a plain move', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  await expect(hud).toContainText('Black ejected 0/6 · White ejected 0/6');
  // __cellToScreen reads the camera, which is only set after the first rendered frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));

  const click = async (q: number, r: number) => {
    const p = await page.evaluate(
      ([cq, cr]) => (window as any).__cellToScreen(cq, cr),
      [q, r],
    );
    await page.mouse.click(p.x, p.y);
  };
  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  await expect(hud).toContainText('White to move');
  await expect(hud).toContainText('Black ejected 0/6 · White ejected 0/6');
});
