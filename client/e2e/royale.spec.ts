import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The offline battle royale (#502, rules.md section 10.4): 1 player against 5 bots on the radius 8 arena. The player
// locks an order or holds, the round resolves, and the HUD plate shows the reveal log in initiative order, fizzles
// marked, and the next round's initiative before its reveal.

async function ready(page: Page): Promise<void> {
  await page.goto('./?bot=off');
  await expect(page.locator('#hud')).toContainText('to move');
  // __cellToScreen reads the camera, which is only set after the first rendered frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}

async function click(page: Page, q: number, r: number): Promise<void> {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
}

test('a royale game file loads, and the reveal log marks the fizzled order', async ({ page }) => {
  await ready(page);
  // Round 1: the player orders (-6, 3) E, a marble of Bot 1. It fizzles.
  await page.evaluate(() => (window as any).__royale({ seed: 7, rounds: [[0, 1, 0, -6, 3, 0, 0, 0, 0]] }));
  const hud = page.locator('#hud');
  await expect(hud.locator('.turn')).toHaveText('Battle royale · Round 2');
  await expect(hud.locator('.reveal li')).toHaveCount(6);
  await expect(hud.locator('.reveal li').first()).toHaveText('You: fizzled');
  await expect(hud.locator('.reveal li').first()).toHaveClass('fizzled');
  await expect(hud.locator('.initiative li').first()).toHaveText('Bot 1');
});

test('Battle royale in the mode menu: the player picks an order on the arena, locks it, and the round resolves', async ({
  page,
}) => {
  await ready(page);
  await openModes(page);
  await page.getByRole('button', { name: 'Battle royale' }).click();
  const hud = page.locator('#hud');
  await expect(hud.locator('.turn')).toHaveText('Battle royale · Round 1');
  await expect(hud.locator('.initiative li')).toHaveText(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5']);
  const lock = page.getByRole('button', { name: 'Lock order' });
  await expect(lock).toBeDisabled();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
  await click(page, -2, 6);
  await click(page, -2, 5); // (-2, 6) NW
  await expect(hud).toContainText('Your order: 1 marble NW');
  await lock.click();
  await expect(hud.locator('.turn')).toHaveText('Battle royale · Round 2');
  await expect(hud.locator('.reveal li').first()).toHaveText('You: moved');
  await page.getByRole('button', { name: 'Hold' }).click();
  await expect(hud.locator('.turn')).toHaveText('Battle royale · Round 3');
  await expect(hud.locator('.reveal li').last()).toHaveText('You: held');
});
