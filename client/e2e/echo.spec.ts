import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Echo offers the player the mirror of its move as a free move (#958, game-design.md section 7.4). ?bot=off: the
// test plays both sides through the click hook. Black steps up (its mirror is the Echo's bonus), White steps east: the
// player is offered (0,1) to (-1,1). The screenshots are kept for the report.

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

const click = (page: Page, q: number, r: number) => page.evaluate(([cq, cr]) => (window as any).__click(cq, cr), [q, r]);

test('The Echo offers a free move: its marble ringed, a diamond on the selected target, taking it keeps the turn (#958)', async ({ page }) => {
  const body = page.locator('body');
  const tell = page.locator('#hud .boss .tell');
  await page.emulateMedia({ reducedMotion: 'reduce' }); // slides take no time
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(page.locator('#hud')).toContainText('The Echo');
  for (const [q, r] of [[0, 2], [0, 1], [0, -1], [1, -1]] as const) await click(page, q, r);
  await expect(body).toHaveAttribute('data-echo-free', '1');
  await expect(tell).toHaveText('Free move: a ringed marble moves for free, any other move declines it');
  await freshDraw(page);
  await page.screenshot({ path: 'test-results/echo-offer-ringed.png' });

  await click(page, 0, 1);
  await expect(body).toHaveAttribute('data-echo-free-target', '1');
  await expect(tell).toHaveText('Free move: the diamond target is free, then you move again');
  await freshDraw(page);
  await page.screenshot({ path: 'test-results/echo-offer-selected.png' });

  await click(page, -1, 1);
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(3);
  await expect(body).toHaveAttribute('data-echo-free', '0');
  await expect(tell).toHaveCount(0);
});
