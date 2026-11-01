import { expect, test } from '@playwright/test';
import { WALLED_IN } from '../src/test/blockedline';

// Issue #1301: a side with marbles but no legal move passes its turn. The test hook loads a Trainer wave whose last ply
// walls the bot's marble in on a corner: the HUD says its turn passed, and the player is to move again.
test('a walled-in side passes: the HUD says so and the other side moves again', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.evaluate(() => (window as any).__trainer(1));
  const turn = (await page.locator('#hud .turn').textContent())!;
  const bot = turn.startsWith('Black') ? 'White' : 'Black'; // the names follow the glass the sides wear
  await page.evaluate((moves) => (window as any).__playMoves(moves), WALLED_IN);
  await expect(page.locator('#hud')).toContainText(`${bot} has no move: turn passed`);
  await expect(page.locator('#hud .turn')).toHaveText(turn);
  expect(await page.evaluate(() => (window as any).__plies())).toBe(WALLED_IN.length);
});
