import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

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

// The flash itself (peak 1, scale 1.4, fade over --motion-base) is the unit test of lastMovePulse: a sampled peak in
// a browser depends on the runner's frame rate (0.85 seen on CI, 30 s timeout), so only the settled mark is read here.
test('the last move carries a ring that settles to the resting mark once the marble lands', async ({ page }, info) => {
  await play(page);
  await expect.poll(() => page.evaluate(() => (window as any).__lastMoveRing().opacity)).toBeCloseTo(0.9, 2); // settles to the mark
  await shot(page, { path: info.outputPath('last-move.png') });
});

test('reduced motion: the last move is a static mark, no pulse', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await play(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__peak)).toBeCloseTo(0.9, 2);
  expect(await page.evaluate(() => (window as any).__lastMoveRing().scale)).toBe(1);
  await shot(page, { path: info.outputPath('last-move-reduced.png') });
});

test('against the bot, the HUD says what the bot moved (#1680)', async ({ page }, info) => {
  await page.goto('./?bot=on&nodes=50');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  for (const [q, r] of [[0, 2], [0, 1]] as const) {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('#hud')).toContainText(/Bot moved \d marbles? (right|left|up-right|down-left|up-left|down-right)/);
  await shot(page, { path: info.outputPath('bot-note.png') });
});
