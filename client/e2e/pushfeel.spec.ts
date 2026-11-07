import { expect, test, type Page } from '@playwright/test';

// How a push lands (#1560): the pushed marble squashes on arrival, an ejection kicks the camera for at most 250 ms. A slide cannot be
// captured (automation draws one frame in 100 ms at most), so the page samples the poses itself, on every animation frame.

// Plies 1 to 4 of the 3v2 push of eject.spec.ts, as the game file records them, loaded by the import instead of clicked.
const FOUR_PLIES = [
  [3, 4, -2, 2, -2, 3, -2, 4],
  [2, 3, 0, -3, 0, -2, 0, 0],
  [3, 4, -2, 1, -2, 2, -2, 3],
  [2, 1, -1, -2, -1, -1, 0, 0],
];

async function open(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.locator('#import-file').setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, mode: 'local', layout: 'standard', bot: false, moves: FOUR_PLIES })) });
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(4);
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/);
  return async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
}

// Samples, on every animation frame, the smallest and the largest height any marble is drawn with (1 at rest) and when the camera kick
// (data-kick) starts and ends.
async function sample(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const f = (w.__feel = { kickOn: 0, kickOff: 0, min: 1, max: 1 });
    const tick = (now: number): void => {
      const on = document.body.dataset.kick === 'on';
      if (on && !f.kickOn) f.kickOn = now;
      if (!on && f.kickOn && !f.kickOff) f.kickOff = now;
      for (const o of w.__marbles().children as any[]) {
        if (o.geometry?.type !== 'SphereGeometry') continue;
        const height = Math.hypot(o.matrix.elements[1], o.matrix.elements[5], o.matrix.elements[9]);
        f.min = Math.min(f.min, height);
        f.max = Math.max(f.max, height);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const feel = (page: Page) => page.evaluate(() => (window as any).__feel as { kickOn: number; kickOff: number; min: number; max: number });

test('a push that ejects squashes the marbles on arrival and kicks the camera for under 250 ms', async ({ page }) => {
  const click = await open(page);
  await sample(page);
  await click([-2, 0], [-2, 1], [-2, 2], [-2, -1]); // 5. 3v2 push, the last White marble leaves
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  await expect(page.locator('body')).toHaveAttribute('data-kick', 'on');
  await expect(page.locator('body')).not.toHaveAttribute('data-kick', /.*/, { timeout: 2000 });
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/);
  const seen = await feel(page);
  expect(seen.kickOn).toBeGreaterThan(0);
  expect(seen.kickOff).toBeGreaterThan(seen.kickOn); // the kick starts and ends; its 240 ms span is a unit test (kick.test.ts, #1617)
  expect(seen.min).toBeLessThan(0.95); // the marbles squashed ...
  expect(seen.max).toBeGreaterThan(1.005); // ... and rebounded
  await page.evaluate(() => (window as any).__drawNext());
  await expect.poll(() => page.evaluate(() => (window as any).__kick())).toEqual({ zoom: 1, x: 0, y: 0 }); // the picture is the resting one again
});

test('a plain move squashes its marble but never kicks the camera', async ({ page }) => {
  const click = await open(page);
  await sample(page);
  const mv = await page.evaluate(() => (window as any).__legal().find((m: any) => m.cells.length === 1));
  await click(mv.cells[0]);
  const target = await page.evaluate((dir) => (window as any).__targets().find((t: any) => t.dir === dir).cell, mv.dir);
  await click(target);
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/);
  await expect.poll(async () => (await feel(page)).min).toBeLessThan(0.95);
  expect(await page.evaluate(() => document.body.dataset.kick)).toBeUndefined();
  expect((await feel(page)).kickOn).toBe(0);
});
