import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #962: the Open world mode, behind ?openworld=<seed>: the hero rolls over the generated world, an obstacle (here water or a
// tree on seed 7) stops it, and Escape leaves to the board.
test('the hero rolls over the Open world, an obstacle stops it, and Escape leaves, #965', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect.poll(at).toBe('2,-3');
  await page.keyboard.press('ArrowUp'); // the cell ahead is blocked on this seed
  await expect.poll(at).toBe('2,-3');
  await page.keyboard.press('ArrowRight');
  await expect.poll(at).toBe('3,-3');
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
});

test('the entry is not in the mode menu without the flag, #965', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#openworld')).toBeHidden();
});
