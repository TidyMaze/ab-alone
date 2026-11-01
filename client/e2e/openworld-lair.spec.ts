import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #1170, #1171: 14 landmark lairs in the Open world. The test hook stands the hero next to the first lair (no 150-cell walk); the step
// onto the lair starts the normal boss fight.
test('walking onto a lair of the Open world starts a boss fight, #1170', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  const lairs = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ');
  expect(lairs.length).toBeGreaterThanOrEqual(14); // one lair per boss of the roster (#1171), which grows
  await expect(page.locator('#openworld-medals')).toHaveText(`Medals 0 / ${lairs.length}`);
  await expect(page.locator('#openworld-tally')).toHaveText('Claim 0412: unworked.'); // Tally's line, once per player (#1171)
  const [q, r] = lairs[0]!.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([q, r]) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] }),
    [q, r],
  );
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe(`${q - 1},${r}`);
  await page.screenshot({ path: process.env.LAIR_SHOT ?? 'test-results/lair.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-boss', /.+/);
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
});

// #1175: every lair beaten ends the Open world with one line from Tally. The hook loads the beaten lairs (no 15 boss fights).
test("Tally's ending line shows once every lair is beaten, #1175", async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  await page.evaluate(() => localStorage.setItem('ab-alone.tally0412', 'seen')); // the claim line is spent
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  const count = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ').length;
  const fixture = (beaten: number[]) =>
    page.evaluate((beaten) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [], enemies: [], beaten }), beaten);
  await fixture(Array.from({ length: count - 1 }, (_, i) => i)); // all lairs but one
  await expect(page.locator('#openworld-tally')).toHaveText('');
  await fixture(Array.from({ length: count }, (_, i) => i));
  await expect(page.locator('#openworld-tally')).toHaveText('Variance noted. Clamp: open. Crew attached: 6.');
  await page.screenshot({ path: process.env.LAIR_SHOT ?? 'test-results/ending.png' });
});

// #1315: Tally's ledger line counts the seats on file while some lairs are beaten, on a phone-width HUD. The hook beats three lairs, then a
// reload opens the world again (the saved lairs come back on the open).
test('the ledger line counts the seats on file on a phone, #1315', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  const count = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ').length;
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0, 1, 2] }));
  await page.keyboard.press('Escape'); // leaving the world saves it
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldSaved)).toBe('1');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
  await expect(page.locator('#openworld-tally')).toHaveText(`Seats on file: 3 of ${count}. Slag-glass remembers heat.`);
  const [hud, line] = [await page.locator('#openworld-hud').boundingBox(), await page.locator('#openworld-tally').boundingBox()];
  expect(hud!.x + hud!.width).toBeLessThanOrEqual(390);
  expect(hud!.y + hud!.height).toBeLessThanOrEqual(844);
  expect(line!.height).toBeLessThan(60); // the line wraps to two lines at most
  await page.screenshot({ path: process.env.LEDGER_SHOT ?? 'test-results/ledger.png' });
});
