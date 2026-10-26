import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The Pulsar (#675, game-design.md section 7.10) from the fixture of the core tests: fight seed 2 and ?bot=off, so the
// test plays both sides through the click hook. The first pulsar pushes NW, off the bottom corner. The pulse after
// ply 5 throws the lone boss marble on (4, -4) off and leaves the player's pairs at the bottom left in place; the ones
// after plies 9 and 13 eject 2 more: P2, force 3. The screenshots are kept for the report.

const [E, W, SW, NW, SE] = [0, 1, 3, 4, 5];
const FIXTURE: [number, number, number][] = [
  [-2, 2, NW], [4, -3, SW], [-1, 2, NW], [0, -2, SW], [0, 2, NW], [3, -3, E], [-2, 1, NW], [-1, -1, W], [-1, 1, NW],
  [-2, -1, W], [0, 1, NW], [-3, -1, SE], [-2, 0, NW],
];

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startPulsar(page: Page, reducedMotion: boolean): Promise<void> {
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(2)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Pulsar' }).click();
  await expect(page.locator('#hud')).toContainText('The Pulsar');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'bridge');
  await page.mouse.move(2, 2); // no hover ghost
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
}

const marbleAt = (page: Page, q: number, r: number) => page.evaluate(([cq, cr]) => (window as any).__marbleTurn(cq, cr) !== null, [q, r]);
const outPips = (page: Page) => page.locator('#hud .pips > span').evaluateAll((sides) => sides.map((s) => s.querySelectorAll('.out').length));

test('The Pulsar: a charging pulsar counts down, fires, throws a lone marble off and leaves a pair, then force 3, #675', async ({ page }, testInfo) => {
  const body = page.locator('body');
  const tell = page.locator('#hud .boss .tell');
  await startPulsar(page, true);
  await expect(tell).toHaveText('Pulse in 3 turns, force 2');
  await expect(body).toHaveAttribute('data-pulse-counter', '');
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('pulsar-start.png') });
  await plies(page, 0, 1);
  await expect(body).toHaveAttribute('data-pulse-counter', '2'); // it charges: 2 turns ahead
  await plies(page, 1, 4);
  await expect(body).toHaveAttribute('data-pulse-counter', '1');
  await expect(tell).toHaveText('Pulse in 1 turn, force 2');
  expect(await page.evaluate(() => (window as any).__pulsar())).toEqual({ id: NW, left: 1, force: 2, charging: true });
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('pulsar-before.png') });
  await plies(page, 4, 5); // the player's 3rd move: the pulse
  await expect(body).toHaveAttribute('data-pulses', '1');
  expect(await outPips(page)).toEqual([1, 0]); // the boss marble counts for the player
  expect(await marbleAt(page, 4, -4)).toBe(false); // the lone one on the far rim is off
  expect(await marbleAt(page, -4, 4)).toBe(true); // the pair resists
  expect(await marbleAt(page, -4, 3)).toBe(true);
  await expect(body).toHaveAttribute('data-pulse-counter', '2'); // charging again
  await page.waitForFunction(() => (window as any).__shock() === null);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('pulsar-after.png') });
  await plies(page, 5, 13);
  await expect(body).toHaveAttribute('data-pulses', '3');
  expect(await outPips(page)).toEqual([3, 0]);
  await expect(page.locator('#hud .notch.active')).toHaveText('P2'); // after 3 ejections
  await expect(tell).toHaveText('Pulse in 4 turns, force 3'); // the phase raises the force
});

test('The Pulsar: the shockwave grows from the pulsar across the board, #675', async ({ page }, testInfo) => {
  const body = page.locator('body');
  await startPulsar(page, false);
  await plies(page, 0, 5);
  await expect(body).toHaveAttribute('data-pulsing', '1');
  const radii: number[] = [];
  for (let frame = 0; frame < 6; frame++) {
    await freshDraw(page);
    const shock = await page.evaluate(() => (window as any).__shock());
    if (shock === null) break;
    radii.push(shock.radius);
    await page.screenshot({ path: testInfo.outputPath(`pulsar-shock-${frame}.png`) });
  }
  expect(radii.length).toBeGreaterThan(0);
  expect(radii).toEqual([...radii].sort((a, b) => a - b)); // it grows
  await expect(body).not.toHaveAttribute('data-pulsing', '1');
  await expect(body).toHaveAttribute('data-pulses', '1');
});

test('The Pulsar: on 1280x720 every pulsar and the charging counter stay inside the window, #691', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startPulsar(page, true);
  await plies(page, 0, 1);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('pulsar-1280x720.png') });
  type Bounds = { name: string; rect: { x: number; y: number; width: number; height: number } };
  const bounds = await page.evaluate(() => (window as any).__pulsarBounds() as Bounds[]);
  expect(bounds.length).toBeGreaterThan(0);
  for (const { name, rect } of bounds) {
    expect(rect.y, `${name} top off screen`).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height, `${name} bottom cut off`).toBeLessThanOrEqual(720);
    expect(rect.x, `${name} left off screen`).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width, `${name} right off screen`).toBeLessThanOrEqual(1280);
  }
});
