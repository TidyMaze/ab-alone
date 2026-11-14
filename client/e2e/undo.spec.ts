import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// Undo (#1672): in a casual bot game it takes back the player's move and the bot's reply. Absent (not disabled) elsewhere.

async function ready(page: Page): Promise<void> {
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
  await expect(page.locator('#hint')).toBeEnabled();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}
async function click(page: Page, q: number, r: number): Promise<void> {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
}
const plies = (page: Page) => page.evaluate(() => (window as any).__plies() as number);

test('Undo takes back the move and the bot reply, #1672', async ({ page }) => {
  await page.goto('./?nodes=30');
  await ready(page);
  const undo = page.locator('#undo');
  await expect(undo).toBeHidden(); // nothing to take back
  await click(page, 0, 2);
  await click(page, 0, 1);
  await expect.poll(() => plies(page)).toBe(2); // the move and the bot's reply
  await expect(undo).toBeVisible();
  await shot(page, { path: process.env.UNDO_SHOT ?? 'test-results/undo.png' });
  await undo.click();
  expect(await plies(page)).toBe(0);
  await expect(undo).toBeHidden();
});
