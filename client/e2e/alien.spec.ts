import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Alien (#588, game-design.md section 7.7) from a fixture: fight seed 7 and ?bot=off, so the test plays both sides
// with quiet forward moves through the click hook. They lay the first egg on (-3, 1) at ply 4, next to a Black
// marble. The screenshots are kept for the report.

type Axial = [number, number];
type Move = { cells: Axial[]; dir: number };
type Egg = { cell: Axial; left: number; glow: boolean };
const FIRST_EGG: Axial = [-3, 1];

const eggs = (page: Page) => page.evaluate(() => (window as any).__eggs()) as Promise<Egg[]>;

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startAlien(page: Page): Promise<void> {
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(7)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // slides take no time
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Alien' }).click();
  await expect(page.locator('#hud')).toContainText('The Alien');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'cargo');
}

/** `n` quiet plies in one call to the page: the first one-marble forward move of the side to move (NW or NE for Black,
 * SE or SW for the Alien) that ends on no egg, else the first one-marble move that ends on no egg. */
const quiet = (page: Page, n: number) =>
  page.evaluate((count) => {
    const w = window as any;
    const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
    for (let i = 0; i < count; i++) {
      const forward = w.__plies() % 2 === 0 ? [4, 2] : [5, 3];
      const laid = w.__eggs().map((e: Egg) => String(e.cell));
      const to = (m: Move) => [m.cells[0]![0] + DIRS[m.dir]![0]!, m.cells[0]![1] + DIRS[m.dir]![1]!];
      const spare = w.__legal().filter((m: Move) => m.cells.length === 1 && !laid.includes(String(to(m))));
      const mv = spare.find((m: Move) => forward.includes(m.dir)) ?? spare[0];
      w.__click(...mv.cells[0]);
      w.__click(...to(mv));
    }
  }, n);

test('The Alien lays an egg whose counter goes down, then it hatches into an Alien marble, #588', async ({ page }, testInfo) => {
  const body = page.locator('body');
  const tell = page.locator('#hud .boss .tell');
  await startAlien(page);
  await expect(body).toHaveAttribute('data-eggs', '0');
  await quiet(page, 4);
  await expect(body).toHaveAttribute('data-eggs', '1');
  await expect(body).toHaveAttribute('data-egg-counters', '4');
  await expect(tell).toHaveText('Eggs hatch: 1 in 4 turns');
  expect(await eggs(page)).toEqual([{ cell: FIRST_EGG, left: 4, glow: false }]);
  await page.mouse.move(2, 2); // no hover ghost
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('alien-egg.png') });
  await quiet(page, 1);
  await expect(body).toHaveAttribute('data-egg-counters', '3'); // down after the player move
  await quiet(page, 5);
  await expect(body).toHaveAttribute('data-egg-counters', '1,3');
  expect((await eggs(page))[0]).toEqual({ cell: FIRST_EGG, left: 1, glow: true }); // the egg on 1 glows
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('alien-egg-on-1.png') });
  await quiet(page, 1); // ply 11: the hatch
  await expect(body).toHaveAttribute('data-egg-counters', '2');
  const alien = (await page.evaluate(() => (window as any).__legal())) as Move[];
  expect(alien.some((m) => String(m.cells) === String(FIRST_EGG))).toBe(true); // the new Alien marble moves
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('alien-hatched.png') });
});

test('The Alien: a marble that ends its move on an egg crushes it, #588', async ({ page }, testInfo) => {
  const body = page.locator('body');
  await startAlien(page);
  await quiet(page, 4);
  expect((await eggs(page)).map((e) => e.cell)).toEqual([FIRST_EGG]);
  await page.evaluate(() => {
    const w = window as any;
    w.__click(-3, 2); // Black (-3, 2) NW onto the egg
    w.__click(-3, 1);
  });
  await expect(body).toHaveAttribute('data-eggs', '0');
  await expect(page.locator('#hud .boss .tell')).toHaveCount(0);
  await page.mouse.move(2, 2);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('alien-crushed.png') });
});
