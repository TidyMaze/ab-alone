import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1110: particles drift near the hero in the Open world (pollen, leaves, snow or dust by biome), a step kicks up a dust puff, and
// reduced motion draws none. The page marks the count it draws (`data-openworld-particles`, webdriver pages only).
async function enter(page: Page): Promise<void> {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
}
const count = (page: Page) => page.evaluate(() => Number(document.body.dataset.openworldParticles ?? 0));

test('particles drift near the hero in the Open world, #1110', async ({ page }) => {
  await enter(page);
  await expect.poll(() => count(page)).toBeGreaterThan(2);
  expect(await count(page)).toBeLessThanOrEqual(64);
  await page.keyboard.press('ArrowRight'); // a step kicks up dust on top of the ambient particles
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,0');
});

test('no particle is drawn under reduced motion, #1110', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,0');
  await page.waitForTimeout(1500);
  expect(await count(page)).toBe(0);
});
