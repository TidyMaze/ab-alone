import { expect, test } from '@playwright/test';
import { loseByRepetition } from './fight-end';
import { openModes } from './modes';

// One mode at a time (#1275, docs/specs/ui.md): a mode left for another leaves nothing of itself on screen. The modes load
// through the test hooks (a royale file, the Open world fixture); src/main.modeswitch.test.ts covers every mode.

test('a boss fight and a battle royale left for the Hub leave no control and no marble behind, #1275', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#hud')).toContainText('Hub');
  await openModes(page);
  await page.locator('#boss-fight').click();
  await page.locator('#boss-list button').first().click();
  await expect(page.locator('#boss-retry')).toBeVisible();
  await expect(page.locator('#boss-bar')).toBeVisible();
  await openModes(page);
  await page.locator('#ship').click();
  await expect(page.locator('#hud')).toContainText('Hub');
  for (const id of ['#boss-retry', '#boss-goal', '#boss-bar']) await expect(page.locator(id)).toBeHidden();
  await expect(page.locator('#new-game')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.boss)).toBeUndefined();
  await page.evaluate(() => (window as unknown as { __royale: (file: object) => void }).__royale({ seed: 7, rounds: [] }));
  await expect(page.locator('#royale-hold')).toBeVisible();
  await openModes(page);
  await page.locator('#ship').click();
  await expect(page.locator('#hud')).toContainText('Hub');
  await expect(page.locator('#royale-hold')).toBeHidden();
  // The arena's marbles are drawn from their group, hidden arena or not: none is left to draw.
  expect(await page.evaluate(() => (window as unknown as { __seatGlyphs: () => number[] }).__seatGlyphs())).toEqual([0, 0, 0, 0, 0, 0]);
  const drawn = await page.evaluate(() => (window as never as { __drawNext: () => number }).__drawNext()); // under automation the loop draws when asked (#365)
  await expect.poll(() => page.evaluate(() => (window as never as { __draws: () => number }).__draws())).toBeGreaterThan(drawn);
  await page.screenshot({ path: process.env.MODE_SWITCH_SHOT ?? 'test-results/mode-switch-hub.png' });
});

test('an Open world lair fight lost, Back to the Open world: nothing of the fight shows over the world, #1275', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  const [q, r] = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ')[0]!.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([q, r]) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] }),
    [q, r],
  );
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe(`${q - 1},${r}`);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-boss', 'echo'); // the first lair is The Echo's
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null)))); // the fight's camera is set
  await loseByRepetition(page);
  await page.getByRole('button', { name: 'Lobby' }).click(); // Back sits in the lobby sheet (#1044)
  await page.getByRole('button', { name: 'Back to the Open world' }).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await expect(page.locator('#openworld-hud')).toBeVisible();
  for (const id of ['#boss-bar', '#auto-reason', '#hud']) await expect(page.locator(id)).toBeHidden();
  // The lost fight's end light dims no world (body[data-over]).
  expect(await page.locator('canvas').evaluate((c) => getComputedStyle(c).filter)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.body, '::before').display)).toBe('none');
  await page.screenshot({ path: process.env.MODE_SWITCH_WORLD_SHOT ?? 'test-results/mode-switch-world.png' });
});
