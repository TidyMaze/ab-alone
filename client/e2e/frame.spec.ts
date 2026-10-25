import { expect, test, type Page } from '@playwright/test';

// The 61 cells sit on a hexagonal steel frame (#292, world.md section 6): a plate under them, a rim around them.
const frame = (page: Page) => page.evaluate(() => (window as any).__frame());
const rings = (page: Page) => page.evaluate(() => (window as any).__rings());
// __cellToScreen is linear in q and r: fractional coordinates give any point of the board plane.
const clickAt = async (page: Page, q: number, r: number) => {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
};

test('the cells sit on a steel frame that never takes a click meant for a cell, #292', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect(await frame(page)).toEqual({ radius: 4, holes: 0, drawn: true });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  // On the rim, straight below the Black marble on (0, 4): 0.68 past its centre, past its disc.
  const d = 0.68 / (Math.sqrt(3) / 2);
  await clickAt(page, -d / 2, 4 + d);
  expect(await rings(page)).toEqual([]);
  await clickAt(page, 0, 4);
  expect(await rings(page)).toEqual([[0, 4]]);
});

test('clear board and the low tier keep the frame, #292', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ab-alone.quality', 'low');
    localStorage.setItem('ab-alone.clear-board', 'on');
  });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'low');
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'on');
  expect(await frame(page)).toEqual({ radius: 4, holes: 0, drawn: true });
});

test("The Choir's radius 3 board gets a frame of its size, #292", async ({ page }) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Choir' }).click();
  await expect(page.locator('#hud')).toContainText('The Choir');
  expect(await frame(page)).toEqual({ radius: 3, holes: 0, drawn: true });
});
