import { expect, test } from '@playwright/test';
import { lowTierOnCi } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1504: a single marble beside a foe shoves it when water lies behind it. Seed 1: after the hero steps from (11,-29) to (11,-30), the foe
// on (12,-30) has water on (13,-30) behind it (east), so it is ejected and the hero takes its cell. The state comes from the test hook.
test('a foe next to water is shoved in by one marble, #1504', async ({ page }) => {
  await page.goto('./?bot=off&openworld=1');
  await page.locator('canvas[aria-label="Edgefall board"]').waitFor();
  const data = (key: string) => page.evaluate((k) => document.body.dataset[k], key);
  await expect.poll(() => data('openworldAt')).toBe('0,0');
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [11, -29], troop: [], enemies: [[12, -30]] }));
  await expect.poll(() => data('openworldAt')).toBe('11,-29');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => data('openworldPush')).toBe('1');
  expect(await data('openworldBeaten')).toBe('1');
  expect(await data('openworldAt')).toBe('12,-30');
  expect(await page.evaluate(() => (window as unknown as { __openworldEnemies: () => number[][] }).__openworldEnemies())).toEqual([]);
  await shot(page, { path: 'test-results/openworld-shove.png' });
});
