import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// Tally's line at the start of a match (#294): one line in the HUD plate, gone after the first move.

test('a local game starts with Tally\'s line, the first move takes it off the plate', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud .tally')).toHaveText('Mess: two crews, one table. Ledger open.');

  const p = await page.evaluate(() => (window as any).__cellToScreen(0, 2));
  await page.mouse.click(p.x, p.y);
  const q = await page.evaluate(() => (window as any).__cellToScreen(0, 1));
  await page.mouse.click(q.x, q.y);

  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('#hud .tally')).toHaveCount(0);
});

test('a boss fight starts with the line of its boss', async ({ page }) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();

  await expect(page.locator('#hud .tally')).toHaveText('Echo: mirror logged. Six out to balance the books.');
});
