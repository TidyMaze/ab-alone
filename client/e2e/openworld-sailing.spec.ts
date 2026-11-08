import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi } from './modes';

lowTierOnCi();

// #1441: the hero and the troop sail on water, each marble on a small low-poly boat. Seed 1 has open ground on (14,-27) and (14,-26)
// with water on the three cells north-west of it, where Left steps at the resting yaw (#1273). The state comes from the test hook.
const drawn = (page: Page) => page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn ?? '{}').boats as number);
const at = (page: Page) => page.evaluate(() => document.body.dataset.openworldAt);

test('the hero and the troop sail onto the water, each marble on a boat, #1441', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the marbles jump: the drawn boats are published with the step
  await page.goto('./?bot=off&openworld=1');
  await page.locator('canvas[aria-label="Edgefall board"]').waitFor();
  await expect.poll(() => at(page)).toBe('0,0');
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [14, -27], troop: [[14, -26]], enemies: [] }));
  await expect.poll(() => at(page)).toBe('14,-27');
  expect(await drawn(page)).toBe(0); // on land: no boat
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => at(page)).toBe('14,-28'); // the hero sails on to the water
  await expect.poll(() => drawn(page)).toBe(1); // its boat; the troop marble behind it is still on land (14,-27)
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => at(page)).toBe('14,-29');
  await expect.poll(() => drawn(page)).toBe(2); // the troop marble sails too
});
