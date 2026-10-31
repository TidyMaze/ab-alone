import { expect, test, type Page } from '@playwright/test';

// The last move wears a ring that flashes when the slide ends, a static mark under reduced motion (#1092).
async function play(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.evaluate(() => {
    (window as any).__peak = 0;
    const tick = () => {
      (window as any).__peak = Math.max((window as any).__peak, (window as any).__lastMoveRing().opacity);
      requestAnimationFrame(tick);
    };
    tick();
  });
  for (const [q, r] of [[0, 2], [0, 1]] as const) {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-last-move', '1');
}

test('the last move carries a ring that pulses once the marble lands', async ({ page }, info) => {
  await play(page);
  await expect.poll(() => page.evaluate(() => (window as any).__peak)).toBeGreaterThan(0.9);
  await expect.poll(() => page.evaluate(() => (window as any).__lastMoveRing().opacity)).toBeCloseTo(0.55, 2); // settles to the mark
  await page.screenshot({ path: info.outputPath('last-move.png') });
});

test('reduced motion: the last move is a static mark, no pulse', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await play(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__peak)).toBeCloseTo(0.55, 2);
  expect(await page.evaluate(() => (window as any).__lastMoveRing().scale)).toBe(1);
  await page.screenshot({ path: info.outputPath('last-move-reduced.png') });
});
