import { expect, test } from '@playwright/test';

test('click a marble, click a direction, the board changes and the turn passes', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');

  const click = async (q: number, r: number) => {
    const p = await page.evaluate(
      ([cq, cr]) => (window as any).__cellToScreen(cq, cr),
      [q, r],
    );
    await page.mouse.click(p.x, p.y);
  };
  const before = await page.screenshot();

  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  await expect(page.locator('#hud')).toContainText('White to move');
  const after = await page.screenshot({ path: 'e2e/after-move.png' });
  expect(after.equals(before)).toBe(false);
});
