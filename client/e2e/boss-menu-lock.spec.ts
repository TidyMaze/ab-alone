import { expect, test } from '@playwright/test';
import { openModes } from './modes';
import { shot } from './shot';

// #1527: the Modes menu's boss list follows the Hub's lifts. A boss above the player's progress is locked, with the boss to beat, and
// starts nothing; the bosses the player has beaten stay open. `?locks` gives an automated page a player's menu (the other specs keep it
// open), and progress is loaded as a save, the way an older save is.

const progress = (beaten: string[]) => JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0], beaten });

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch: label === 'phone' });

    test(`the boss list locks the bosses the Hub would not reach and starts none of them, ${label}, #1527`, async ({ page }, testInfo) => {
      await page.goto('./?locks');
      await page.locator('canvas').waitFor();
      await openModes(page);
      await page.locator('#boss-fight').click();
      const list = page.locator('#boss-list');
      const echo = list.getByRole('button', { name: 'The Echo' });
      const choir = list.getByRole('button', { name: 'The Choir' });
      await expect(echo).not.toHaveAttribute('aria-disabled', 'true');
      await expect(choir).toHaveAttribute('aria-disabled', 'true');
      await expect(choir).toContainText('Beat The Hull first');
      await expect(list.locator('[aria-disabled="true"]')).toHaveCount(13);
      await shot(page, { path: testInfo.outputPath(`1527-boss-menu-${label}.png`) });
      await choir.click({ force: true });
      await expect(page.locator('body')).not.toHaveAttribute('data-boss', /./);
      await expect(list).toBeVisible(); // still open, nothing started
      await echo.click();
      await expect(page.locator('body')).toHaveAttribute('data-boss', 'echo');
    });
  });
}

test('a save with The Echo beaten opens the Cargo deck bosses, and a boss beaten stays open, #1527', async ({ page }) => {
  await page.addInitScript((save) => localStorage.setItem('ab-alone.progress', save), progress(['echo', 'pulsar']));
  await page.goto('./?locks');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#boss-fight').click();
  const list = page.locator('#boss-list');
  for (const name of ['The Hull', 'The Swarm', 'The Pulsar']) await expect(list.getByRole('button', { name })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(list.getByRole('button', { name: 'The Choir' })).toHaveAttribute('aria-disabled', 'true');
});

test('a page with no ?locks keeps every boss open, as the other specs need, #1527', async ({ page }) => {
  await page.goto('./?bot=off');
  await openModes(page);
  await page.locator('#boss-fight').click();
  await expect(page.locator('#boss-list [aria-disabled="true"]')).toHaveCount(0);
});
