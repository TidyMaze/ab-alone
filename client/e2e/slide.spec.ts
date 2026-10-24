import { expect, test, type Page } from '@playwright/test';

// Marbles slide to their new cell (#135). ?bot=off: both sides are played by hand.
async function open(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // The 200 ms slide can end before a slow runner polls the attribute: count the slides instead.
  await page.evaluate(() => {
    (window as any).__slides = 0;
    let sliding = false;
    new MutationObserver(() => {
      const now = Boolean(document.body.dataset.sliding);
      if (now && !sliding) (window as any).__slides += 1;
      sliding = now;
    }).observe(document.body, { attributes: true });
  });
  const click = async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
  const slides = () => page.evaluate(() => (window as any).__slides);
  return { click, slides };
}

test('a played move slides its marble, then the board settles', async ({ page }) => {
  const { click, slides } = await open(page);
  await click([0, 2], [0, 1]); // a Black marble steps NW
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect.poll(slides).toBe(1);
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/, { timeout: 3000 });
});

test('a move clicked during a slide waits for it, then slides on its own', async ({ page }) => {
  const { click, slides } = await open(page);
  await click([0, 2], [0, 1]); // 1. Black steps NW
  await click([0, -2], [0, -1]); // 2. White steps SE, clicked at once
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(2);
  await expect.poll(slides).toBe(2);
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/, { timeout: 3000 });
});

test('reduced motion: the marble jumps with no slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { click, slides } = await open(page);
  await click([0, 2], [0, 1]);
  await expect(page.locator('#hud')).toContainText('White to move');
  await page.waitForTimeout(400); // longer than the 200 ms slide
  expect(await slides()).toBe(0);
});
