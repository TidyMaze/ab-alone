import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseRecorded } from '../src/test/chaplain-game';
import { openModes } from './modes';

// The Swarm (#1008, game-design.md section 7.14) from the recorded win of the core tests (fight seed 0, ?bot=off): the
// state is loaded by the __playMoves hook. The first wave is announced on a ring, it lands there after the player's
// move, and the 30th reply brings the evac, which lights the whole board.

const plies = parseRecorded(readFileSync(new URL('../../crates/abalone-core/tests/fixtures/swarm.txt', import.meta.url), 'utf8'));
const play = (page: Page, from: number, to: number) => page.evaluate((records) => (window as any).__playMoves(records), plies.slice(from, to));
const swarm = (page: Page) => page.evaluate(() => (window as any).__swarm()) as Promise<{ left: number; cells: [number, number][]; evac: boolean }>;

test('The Swarm: a wave announced on its mark lands there, the turns count down, the evac at turn 30 lights the board, #1008', async ({
  page,
}, testInfo) => {
  const tell = page.locator('#hud .boss .tell');
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(0)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Swarm' }).click();
  await expect(page.locator('#boss-bar .name')).toContainText('The Swarm');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'cargo');
  await expect(tell).toHaveText('30 turns to the evac · 1 marble lands on its mark next turn · the swarm wins after it ejects 2 of your marbles');
  const [mark] = (await swarm(page)).cells;
  await expect(page.locator('body')).toHaveAttribute('data-swarm-marks', mark!.join(','));
  await page.mouse.move(2, 2); // no hover ghost
  await page.screenshot({ path: testInfo.outputPath('swarm-announce.png') });

  await play(page, 0, 1);
  expect(await page.evaluate(([q, r]) => (window as any).__marbleTurn(q, r) !== null, mark!)).toBe(true); // it arrived
  await play(page, 1, 2);
  await expect(tell).toContainText('29 turns to the evac');
  await page.screenshot({ path: testInfo.outputPath('swarm-arrival.png') });

  await play(page, 2, plies.length);
  await expect(tell).toHaveText('The evac lifts you out');
  await expect(page.locator('#hud')).toContainText('Victory');
  expect(await swarm(page)).toMatchObject({ left: 0, evac: true });
  await expect.poll(async () => (await page.evaluate(() => (window as any).__swarm().glow)) as number).toBeGreaterThan(0.5);
  await page.screenshot({ path: testInfo.outputPath('swarm-evac.png') });
});
