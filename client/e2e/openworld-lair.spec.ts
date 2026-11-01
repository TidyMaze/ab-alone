import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #1170: three landmark lairs in the Open world. The test hook stands the hero next to the first lair (no 150-cell walk); the step
// onto the lair starts the normal boss fight.
test('walking onto a lair of the Open world starts a boss fight, #1170', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  const lairs = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ');
  expect(lairs).toHaveLength(14);
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

// #1171: all 14 lairs, the medal count in the HUD (read from the shared store) and Tally's relayed line, said once.
test("the Open world shows 14 lairs, its medals out of 14 and Tally's claim line once, #1171", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ab-alone.medals')) localStorage.setItem('ab-alone.medals', JSON.stringify({ echo: 9, hull: 12 }));
  });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  expect(await page.evaluate(() => document.body.dataset.openworldLairs!.split(' ').length)).toBe(14);
  await expect(page.locator('body')).toHaveAttribute('data-openworld-medals', '2/14');
  await expect(page.locator('#openworld-medals')).toHaveText('2 / 14');
  await expect(page.locator('#openworld-tally')).toHaveText('Tally: Claim 0412: unworked.');
  const [q, r] = (await page.evaluate(() => document.body.dataset.openworldLairs!.split(' ')[0]))!.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([q, r]) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 3, r], troop: [], enemies: [] }),
    [q, r],
  );
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe(`${q - 3},${r}`);
  await page.screenshot({ path: process.env.LAIR_SHOT_ZOOM ?? 'test-results/lair-zoom.png' });
  // Leave and enter again: the count is read again, the line is not said twice.
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('ab-alone.medals', JSON.stringify({ echo: 9, hull: 12, choir: 4 })));
  await openModes(page);
  await page.locator('#openworld').click();
  await expect(page.locator('body')).toHaveAttribute('data-openworld-medals', '3/14');
  await expect(page.locator('#openworld-tally')).toBeHidden();
});
