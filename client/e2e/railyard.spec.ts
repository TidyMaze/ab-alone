import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Rail Yard (#626, game-design.md section 7.8) from a fixture: fight seed 77 and ?bot=off, so the test plays both
// sides with quiet moves through the click hook. The first train is announced at the end of the player's turn 1 on the diagonal q + r = 0,
// from (4, -4) to (-4, 4), where 3 marbles of each side sit. The screenshots are kept for the report.

type Axial = [number, number];
type Train = { line: number; left: number; cells: Axial[]; dir: number };

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startRailYard(page: Page, reducedMotion: boolean): Promise<void> {
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(77)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Rail Yard' }).click();
  await expect(page.locator('#hud')).toContainText('The Rail Yard');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'cargo');
}

/** `n` quiet plies in one call to the page: the first one-marble move of the side to move that starts and ends off
 * every announced line. */
const quiet = (page: Page, n: number) =>
  page.evaluate((count) => {
    const w = window as any;
    const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
    for (let i = 0; i < count; i++) {
      const rails = w.__trains().flatMap((t: Train) => t.cells.map(String));
      const to = (m: { cells: Axial[]; dir: number }) => [m.cells[0]![0] + DIRS[m.dir]![0]!, m.cells[0]![1] + DIRS[m.dir]![1]!];
      const mv = w.__legal().find(
        (m: { cells: Axial[]; dir: number }) => m.cells.length === 1 && !rails.includes(String(m.cells[0])) && !rails.includes(String(to(m))),
      );
      w.__click(...mv.cells[0]);
      w.__click(...to(mv));
    }
  }, n);

const outPips = (page: Page) => page.locator('#hud .pips > span').evaluateAll((sides) => sides.map((s) => s.querySelectorAll('.out').length));

test('The Rail Yard: an announced train counts down, passes, sweeps both sides off its line, then P2, #626', async ({ page }, testInfo) => {
  const body = page.locator('body');
  await startRailYard(page, true);
  await expect(body).toHaveAttribute('data-trains', '0'); // none at the start
  await quiet(page, 1); // the end of the player's turn 1
  await expect(body).toHaveAttribute('data-trains', '1');
  await expect(body).toHaveAttribute('data-train-counters', '5');
  await expect(page.locator('#hud .boss .tell')).toHaveText('Trains pass: 1 in 5 turns');
  expect(await page.evaluate(() => (window as any).__trains().map((t: Train) => [t.line, t.cells[0]]))).toEqual([[22, [4, -4]]]);
  await page.mouse.move(2, 2); // no hover ghost
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('railyard-announced.png') });
  await quiet(page, 1);
  await expect(body).toHaveAttribute('data-train-counters', '5'); // not after the boss move
  await quiet(page, 1);
  await expect(body).toHaveAttribute('data-train-counters', '4'); // down after the player move
  await quiet(page, 7);
  await expect(body).toHaveAttribute('data-train-counters', '1');
  await expect(page.locator('#hud .notch.active')).toHaveText('P1');
  expect(await outPips(page)).toEqual([0, 0]);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('railyard-on-1.png') });
  await quiet(page, 1); // the player's 6th move: the train passes
  await expect(body).toHaveAttribute('data-trains', '0');
  await expect(body).toHaveAttribute('data-passing', '0');
  expect(await outPips(page)).toEqual([3, 3]); // 3 boss marbles for the player, 3 of the player's for the boss
  await expect(page.locator('#hud .notch.active')).toHaveText('P2'); // after 3 ejections
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('railyard-swept.png') });
});

test('The Rail Yard: the freight train runs the line and knocks the marbles off, #626', async ({ page }, testInfo) => {
  const body = page.locator('body');
  await startRailYard(page, false);
  await page.mouse.move(2, 2); // no hover ghost
  for (let ply = 1; ply <= 11; ply++) {
    await page.waitForFunction(() => document.body.dataset.sliding === undefined); // a move waits for the last slide
    await quiet(page, 1);
  }
  await expect(body).toHaveAttribute('data-passing', '1');
  const fronts: number[] = [];
  for (let frame = 0; frame < 6; frame++) {
    await freshDraw(page);
    const pass = await page.evaluate(() => (window as any).__passes());
    if (pass.length === 0) break;
    fronts.push(pass[0].x);
    await page.screenshot({ path: testInfo.outputPath(`railyard-pass-${frame}.png`) });
  }
  expect(fronts.length).toBeGreaterThan(0);
  await expect(body).toHaveAttribute('data-passing', '0');
  await expect(body).toHaveAttribute('data-trains', '0');
});
