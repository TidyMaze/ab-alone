import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Magnetizer (#645, game-design.md section 7.9) from the fixture of the core tests: fight seed 153 and ?bot=off,
// so the test plays both sides through the click hook. Quiet boss moves on the right; the player walks the centre
// column up. Turns 2 and 4 polarize its two marbles; on turn 6 the + steps next to the −, which shoves the boss
// column of 3 off at (0, -4). Two more steps of the + eject 2 more: P2. The screenshots are kept for the report.

type Axial = [number, number];
type Pole = { cell: Axial; sign: number; fresh: boolean };
const NW = 4;
const SE = 5;
const FIXTURE: [number, number, number][] = [
  [0, 2, NW], [4, -3, SE], [0, 1, NW], [4, -2, SE], [0, 0, NW], [4, -1, SE], [0, 3, NW], [3, -3, SE], [0, 2, NW],
  [3, -2, SE], [0, 1, NW], [4, -4, SE], [0, 1, NW], [4, -3, SE], [0, 0, NW], [3, -4, SE], [0, 0, NW], [3, -3, SE],
  [0, -1, NW],
];

const poles = (page: Page) => page.evaluate(() => (window as any).__polarities()) as Promise<Pole[]>;

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startMagnetizer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(153)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the setup slides take no time
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Magnetizer' }).click();
  await expect(page.locator('#hud')).toContainText('The Magnetizer');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'furnace');
}

/** Plies `from` to `to` (excluded) of the fixture, each after the slides of the one before. */
async function plies(page: Page, from: number, to: number): Promise<void> {
  for (const [q, r, dir] of FIXTURE.slice(from, to)) {
    await expect(page.locator('body')).not.toHaveAttribute('data-sliding', '1');
    await page.evaluate(
      ([cq, cr, d]) => {
        const step = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]][d]!;
        (window as any).__click(cq, cr);
        (window as any).__click(cq + step[0]!, cr + step[1]!);
      },
      [q, r, dir],
    );
  }
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', '1');
}

test('The Magnetizer: a + moved next to a − repels and shoves a boss line of 3, ejecting one, #645', async ({ page }, testInfo) => {
  const hud = page.locator('#hud');
  await startMagnetizer(page);
  await expect(page.locator('#hud .boss .tell')).toHaveText('Polarity in 2 turns');
  await plies(page, 0, 10);
  const signs = Object.fromEntries((await poles(page)).map((p) => [String(p.cell), p.sign]));
  expect(signs['0,-1']).toBe(-1);
  expect(signs['0,1']).toBe(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the repulsion plays
  await page.mouse.move(2, 2); // no hover ghost
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('magnetizer-before.png') });
  await plies(page, 10, 11); // the + steps next to the −
  await expect(page.locator('body')).toHaveAttribute('data-repulsions', '1');
  await expect(hud).toContainText('1/6');
  const after = Object.fromEntries((await poles(page)).map((p) => [String(p.cell), p.sign]));
  expect([after['0,-2'], after['0,1']]).toEqual([-1, 1]); // the pair slid apart
  await page.waitForFunction(() => !document.body.dataset.ejecting); // the marble fell
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('magnetizer-after.png') });
});

test('The Magnetizer: the phase changes after 3 ejections, #645', async ({ page }) => {
  await startMagnetizer(page);
  await plies(page, 0, 19);
  await expect(page.locator('#hud')).toContainText('3/6');
  await expect(page.locator('#hud .boss .tell')).toHaveText('Polarity every turn');
});
