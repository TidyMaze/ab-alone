import { expect, test, type Page } from '@playwright/test';

// Each marble starts turned its own way (#346) and rolls as it slides to its new cell (#345). __marbleTurn reads
// the quaternion of the marble drawn on a cell. ?bot=off: both sides are played by hand.
// The roll runs on the page clock, paused while the test reads it: a loaded machine never lets the 200 ms slide end
// between two reads (page.clock, as in newgame.spec.ts).
const START = Date.parse('2026-01-05T12:00:00Z');
const PAUSED = START + 10 * 60_000;

async function open(page: Page): Promise<void> {
  await page.clock.install({ time: START });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  // __cellToScreen reads the camera, which is only set after the first rendered frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}

const turn = (page: Page, q: number, r: number) =>
  page.evaluate(([cq, cr]) => (window as any).__marbleTurn(cq, cr) as number[] | null, [q, r]);

async function click(page: Page, q: number, r: number): Promise<void> {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
}

test('each marble starts turned its own way, the same at every load', async ({ page }) => {
  await open(page);
  const first = [await turn(page, 0, 2), await turn(page, -1, 2), await turn(page, 0, -2)];
  for (const t of first) expect(Math.hypot(...t!)).toBeCloseTo(1); // a rotation
  expect(new Set(first.map((t) => t!.join())).size).toBe(3);
  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect([await turn(page, 0, 2), await turn(page, -1, 2), await turn(page, 0, -2)]).toEqual(first);
});

test('a sliding marble rolls to its new cell, then rests', async ({ page }, testInfo) => {
  await open(page);
  const start = await turn(page, 0, 2);
  await page.clock.pauseAt(PAUSED);
  await click(page, 0, 2);
  await click(page, 0, 1); // the Black marble steps NW
  await expect(page.locator('body')).toHaveAttribute('data-sliding', '1');
  await page.clock.fastForward(100); // half time: one frame draws the slide there
  const mid = await turn(page, 0, 1);
  await page.screenshot({ path: testInfo.outputPath('marble-mid-roll.png') });
  await page.clock.fastForward(300);
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/);
  const end = await turn(page, 0, 1);
  expect(mid).not.toEqual(start);
  expect(mid).not.toEqual(end);
  expect(end).not.toEqual(start);
  await page.clock.fastForward(300);
  expect(await turn(page, 0, 1)).toEqual(end); // at rest, it keeps its turn
});
