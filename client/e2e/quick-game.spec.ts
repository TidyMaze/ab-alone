import { expect, test } from '@playwright/test';
import { matchLine } from '../src/matchline';

// #1612 (Decision #1513): a fresh profile sees the Open world first in the mode menu and reaches it in one press of that entry, and
// the Quick game button starts a bot game from the first screen, outside the world. Each test loads its page on a fresh profile.

test('a fresh profile opens the Open world from the mode menu, which leads with it', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.getByRole('button', { name: 'Game modes' }).click();
  await expect(page.locator('#mode-menu > button:not([hidden])').first()).toHaveText('Open world');
  await page.locator('#mode-menu').getByRole('button', { name: 'Open world' }).click();
  await expect(page.locator('#openworld-hud')).toBeVisible();
});

test('Quick game starts a bot game from the first screen: the HUD names the bot as the other seat', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Quick game' }).click();
  // The plate's subtitle names the bot and the goal (matchline.ts, #1568). Tally's stage-1 bot line is not a Ledger line (only stage 2 is), so it is not asserted here.
  await expect(page.locator('#hud')).toContainText(matchLine({ mode: 'bot', win: 6 }));
});
