import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi } from './modes';

lowTierOnCi();

// #1441: the hero and the troop sail on water, each marble on a small low-poly boat. Seed 1 has open ground on (11,-60) and (12,-60)
// with water on the four cells west of it (`landing` of openworldmode.test.ts). The state comes from the test hook.
const drawn = (page: Page) => page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn ?? '{}').boats as number);
const at = (page: Page) => page.evaluate(() => document.body.dataset.openworldAt);

test('the hero and the troop sail onto the water, each marble on a boat, #1441', async ({ page }) => {
  await page.goto('./?bot=off&openworld=1');
  await page.locator('canvas[aria-label="Abalone board"]').waitFor();
  await expect.poll(() => at(page)).toBe('0,0');
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [12, -60], troop: [], enemies: [] }));
  await expect.poll(() => at(page)).toBe('12,-60');
  expect(await drawn(page)).toBe(0); // on land: no boat
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => at(page)).toBe('10,-60'); // the hero sails on to the water
  await expect.poll(() => drawn(page)).toBe(1); // its boat; the troop marble behind it is still on land (11,-60)
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => at(page)).toBe('9,-60');
  await expect.poll(() => drawn(page)).toBe(2); // the first troop marble sails too, the others are still on land
});
