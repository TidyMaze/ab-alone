import { expect, test } from '@playwright/test';

test('the human plays Black, the bot answers for White and the turn comes back', async ({ page }) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  await expect(hud).toContainText('Black to move');

  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  const plies = () => page.evaluate(() => (window as any).__plies());
  const before = await page.screenshot();

  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  // The bot replies in its worker: two plies are played and the HUD is back on the human side.
  await expect.poll(plies, { timeout: 30_000 }).toBe(2);
  await expect(hud).toContainText('Black to move');
  expect((await page.screenshot()).equals(before)).toBe(false);
});
