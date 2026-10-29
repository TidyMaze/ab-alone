import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Unstable Core (#751, game-design.md section 7.13) from the fixtures of the core tests: fight seed 2 and ?bot=off, so
// the test plays both sides through the click hook. PUSH: a pair walks up the centre column, charging, and pushes the boss
// column of 3 (a plain pair could not). FULL: the boss overloads 4 marbles on the core (plies 8, 10, 16, 18), the core
// collapses on ply 19 with the 5th, and the wedge shockwave hits on ply 25 and shoves 4 of the player's rim marbles off.
// The screenshots are kept for the report.

type Axial = [number, number];
const [NE, SW, NW, SE] = [2, 3, 4, 5];
const PUSH: [Axial[], number][] = [
  [[[0, 2], [0, 3]], NW], [[[-1, -3]], SW], [[[0, 1], [0, 2]], NW], [[[-2, -2]], NE], [[[0, 0], [0, 1]], NW],
  [[[-1, -3]], SW], [[[0, -1], [0, 0]], NW],
];
const FULL: [Axial[], number][] = [
  [[[1, 3]], NE], [[[0, -2]], SE], [[[2, 2]], SW], [[[2, -2]], SW], [[[1, 3]], NE], [[[0, -3]], SE], [[[2, 2]], SW],
  [[[3, -3]], SW], [[[1, 3]], NE], [[[1, -2]], SW], [[[2, 2]], SW], [[[2, -2]], SW], [[[1, 3]], NE], [[[1, -3]], SE],
  [[[2, 2]], SW], [[[4, -3]], SW], [[[1, 3]], NE], [[[0, -2]], SE], [[[2, 2]], SW], [[[3, -2]], NE], [[[1, 3]], NE],
  [[[4, -3]], SW], [[[2, 2]], SW], [[[3, -2]], NE], [[[1, 3]], NE],
];

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startCore(page: Page, reducedMotion = true): Promise<void> {
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(2)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Unstable Core' }).click();
  await expect(page.locator('#hud')).toContainText('The Unstable Core');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'furnace');
  await page.mouse.move(2, 2); // no hover ghost
}

/** Plies `from` to `to` (excluded) of `fixture`, each after the slides of the one before: its marbles, then the cell in
 * front of the first one. */
async function plies(page: Page, fixture: [Axial[], number][], from: number, to: number): Promise<void> {
  for (const [cells, dir] of fixture.slice(from, to)) {
    await expect(page.locator('body')).not.toHaveAttribute('data-sliding', '1');
    await page.evaluate(
      ([marbles, d]) => {
        const step = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]][d as number]!;
        const group = marbles as Axial[];
        for (const [q, r] of group) (window as any).__click(q, r);
        (window as any).__click(group[0]![0] + step[0]!, group[0]![1] + step[1]!);
      },
      [cells, dir] as const,
    );
  }
}

const marbleAt = (page: Page, q: number, r: number) => page.evaluate(([cq, cr]) => (window as any).__marbleTurn(cq, cr) !== null, [q, r]);
const outPips = (page: Page) => page.locator('#hud .pips > span').evaluateAll((sides) => sides.map((s) => s.querySelectorAll('.out').length));
const unstable = (page: Page) => page.evaluate(() => (window as any).__unstable());

test('The Unstable Core: a charged pair pushes three boss marbles, #751', async ({ page }, testInfo) => {
  const tell = page.locator('#hud .boss .tell');
  await startCore(page);
  await expect(tell).toHaveText('Charged marbles weigh more · 4 charges blow a marble off');
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-start.png') });
  await plies(page, PUSH, 0, 6);
  expect((await unstable(page)).pips).toEqual([{ cell: [0, -1], n: 3 }, { cell: [0, 0], n: 2 }]);
  const legal = await page.evaluate(() => (window as any).__legal() as { cells: Axial[]; dir: number }[]);
  expect(legal.some((m) => m.dir === NW && m.cells.length === 2 && m.cells.some(([q, r]) => q === 0 && r === -1))).toBe(true);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-pair.png') });
  await plies(page, PUSH, 6, 7);
  expect(await outPips(page)).toEqual([1, 0]); // the boss marble at the end of the column is off
  expect(await marbleAt(page, 0, -4)).toBe(true);
  expect(await marbleAt(page, 0, -2)).toBe(true); // the column moved up one
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-pushed.png') });
});

test('The Unstable Core: a boss marble that stays on the core overloads and is ejected, #751', async ({ page }, testInfo) => {
  await startCore(page);
  await plies(page, FULL, 0, 7);
  expect((await unstable(page)).pips.map((p: { n: number }) => p.n)).toEqual([3, 2]); // the boss marbles at 3 and 2
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-warn.png') });
  await plies(page, FULL, 7, 8);
  await expect(page.locator('body')).toHaveAttribute('data-bursts', '1');
  expect(await outPips(page)).toEqual([1, 0]);
  expect(await marbleAt(page, 0, -1)).toBe(false);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-overload.png') });
});

// The sweep and the falls play on the page clock (page.clock): the clock is paused before the last ply and stepped by hand,
// so the frames the test samples do not depend on how fast a loaded machine draws (#854).
test('The Unstable Core: the core collapses, then the wedge shockwave shoves the busiest sixth outward, #751', async ({ page }, testInfo) => {
  const tell = page.locator('#hud .boss .tell');
  const body = page.locator('body');
  await page.clock.install();
  await startCore(page);
  await plies(page, FULL, 0, 17);
  await plies(page, FULL, 17, 18);
  await expect(tell).toHaveText('The core collapses after your move');
  await plies(page, FULL, 18, 19);
  await expect(page.locator('#hud .notch.active')).toHaveText('P3'); // 5 ejections, the 5th fell with the core
  await expect(tell).toHaveText('Shockwave in 3 turns');
  expect((await unstable(page)).core).toBe(false);
  await plies(page, FULL, 19, 23);
  await expect(tell).toHaveText('Shockwave after your move: the glowing wedge');
  expect(await unstable(page)).toMatchObject({ wedge: 4, shockIn: 1 });
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('unstable-wedge.png') });
  await plies(page, FULL, 23, 24);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the last ply with the sweep
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await plies(page, FULL, 24, 25);
  // The player's slide ends, then the shockwave fires: step the clock until it does, 100 ms at a time.
  await expect
    .poll(async () => {
      await page.clock.runFor(100);
      return body.getAttribute('data-shockwaves');
    })
    .toBe('1');
  const scales: number[] = [];
  for (let frame = 0; frame < 4; frame++) {
    const sweep = await page.evaluate(() => (window as any).__sweep());
    expect(sweep).not.toBeNull(); // the sweep lasts 650 ms: 4 steps after it fired it is still out
    scales.push(sweep.scale);
    await page.clock.runFor(100);
  }
  expect(scales).toEqual([...scales].sort((a, b) => a - b)); // it grows
  expect(new Set(scales).size).toBe(scales.length);
  await page.clock.runFor(3000); // the sweep is over and the shoved marbles have fallen
  expect(await page.evaluate(() => (window as any).__sweep())).toBeNull();
  expect(await outPips(page)).toEqual([5, 4]); // 4 rim marbles of the player fell
  expect(await marbleAt(page, -4, 4)).toBe(false);
  const asked = await page.evaluate(() => (window as any).__drawNext() as number); // a paused clock draws only when stepped
  await page.clock.runFor(200);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
  await page.screenshot({ path: testInfo.outputPath('unstable-after.png') });
});
