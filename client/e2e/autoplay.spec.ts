import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// Auto-play (#792, docs/specs/ui.md section 4.3): the bot plays the player's side, stoppable, and a boss needs its medal.

const plies = (page: Page) => page.evaluate(() => (window as any).__plies() as number);
const toggle = (page: Page) => page.getByRole('button', { name: 'Auto-play' });

test('the bot plays the player side of a bot game until Auto-play is turned off', async ({ page }) => {
  await page.goto('./?nodes=50');
  await expect(toggle(page)).toBeEnabled();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => plies(page)).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: 'test-results/autoplay-on.png' });
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#hint')).toBeEnabled(); // the bot is done thinking: the board answers clicks again
  const stopped = await plies(page);
  await page.waitForTimeout(1500);
  expect(await plies(page)).toBe(stopped);
});

test('Auto-play is greyed with its reason against a boss without a medal, and plays once the medal is earned', async ({ page }) => {
  await page.goto('./?nodes=50');
  const fight = async () => {
    await openModes(page);
    await page.getByRole('button', { name: 'Boss fight' }).click();
    await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
    await expect(page.locator('#boss-bar .name')).toHaveText('The Echo');
  };
  await fight();
  await expect(toggle(page)).toBeDisabled();
  await expect(page.locator('#auto-reason')).toHaveText('Beat The Echo once to unlock Auto-play against it');
  await page.screenshot({ path: 'test-results/autoplay-greyed.png' });
  await page.evaluate(() => localStorage.setItem('ab-alone.medals', JSON.stringify({ echo: 14 })));
  await fight();
  await expect(toggle(page)).toBeEnabled();
  await toggle(page).click();
  await expect.poll(() => plies(page)).toBeGreaterThanOrEqual(2);
});
