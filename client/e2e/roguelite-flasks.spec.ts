import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The rogue-lite flasks (#1475, docs/specs/roguelite.md section 25), loaded through the test hook: a button on the map drinks a
// flask (3 marbles back, a charge spent) between two nodes, disabled once the army is full or the charges are spent.
const run = (state: object) => ({ seed: 7, army: 8, path: [0], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false, ...state });

test('the rogue-lite flask on the map: drink twice, 3 marbles back each, then the button is disabled, #1475', async ({ page }, testInfo) => {
  const panel = page.locator('#run-map');
  const line = panel.locator('.run-line');
  const flask = panel.locator('button[data-flask]');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await page.evaluate((s) => (window as any).__run(s), run({}));
  await expect(line).toHaveText('Rogue-lite run · army 8 marbles · pick a fight');
  await expect(flask).toHaveText('Drink a flask: 3 marbles back · 2 left');
  await shot(page, { path: testInfo.outputPath('roguelite-flask-before.png') });

  await flask.click();
  await expect(line).toHaveText('Rogue-lite run · army 11 marbles · pick a fight');
  await expect(flask).toHaveText('Drink a flask: 3 marbles back · 1 left');
  await shot(page, { path: testInfo.outputPath('roguelite-flask-after.png') });

  await flask.click();
  await expect(line).toHaveText('Rogue-lite run · army 14 marbles · pick a fight');
  await expect(flask).toBeDisabled();
  await expect(flask).toHaveText('Drink a flask: 3 marbles back · 0 left · no flask left');
});

test('the rogue-lite flask is not on a fight or a choice screen, and the shop sells a charge, #1475', async ({ page }) => {
  const panel = page.locator('#run-map');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), run({ path: [0, 2], scrap: 120 })); // seed 7: the elite 2 leads to the shop 4
  await panel.getByRole('button', { name: 'Act 1, shop' }).click();
  await expect(panel.locator('button[data-flask]')).toHaveCount(0);
  await panel.locator('button[data-buy="5"]').click();
  await expect(panel.locator('button[data-buy="5"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Leave' }).click();
  await expect(panel.locator('button[data-flask]')).toHaveText('Drink a flask: 3 marbles back · 3 left');
});
