import { expect, test, type Page } from '@playwright/test';

// A 3v2 push on the q = -2 column that pushes a White marble off the board, 5 plies, the White
// plies are cooperative (?bot=off). Found by a search over the engine, replay it with the HUD.
async function open(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
}

async function pushOffBoard(page: Page) {
  const click = await open(page);
  // The 600 ms animation can end before a slow runner polls the attribute: record it instead.
  await page.evaluate(() => {
    (window as any).__sawEjecting = false;
    new MutationObserver(() => {
      if (document.body.dataset.ejecting) (window as any).__sawEjecting = true;
    }).observe(document.body, { attributes: true });
  });
  const hud = page.locator('#hud');
  await click([-2, 2], [-2, 3], [-2, 4], [-2, 1]); // 1. Black trio NW
  await expect(hud).toContainText('White to move');
  await click([0, -3], [0, -2], [-1, -2]); // 2. White pair SW
  await click([-2, 1], [-2, 2], [-2, 3], [-2, 0]); // 3. Black trio NW
  await click([-1, -2], [-1, -1], [-2, -2]); // 4. White pair W, into the Black column
  await expect(hud).toContainText('Black to move');
  await expect(page.locator('body')).not.toHaveAttribute('data-ejections', /.*/);
  await click([-2, 0], [-2, 1], [-2, 2], [-2, -1]); // 5. 3v2 push, the last White marble leaves
  await expect(hud).toContainText('White to move');
}

test('an ejected marble animates off the board, then the animation ends', async ({ page }) => {
  await pushOffBoard(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-ejections', '1');
  await expect.poll(() => page.evaluate(() => (window as any).__sawEjecting)).toBe(true);
  await expect(body).not.toHaveAttribute('data-ejecting', /.*/, { timeout: 3000 });
});

test('reduced motion: the marble disappears with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pushOffBoard(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-ejections', '1');
  await page.waitForTimeout(800); // longer than the 600 ms animation
  expect(await page.evaluate(() => (window as any).__sawEjecting)).toBe(false);
});
