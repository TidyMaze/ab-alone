import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The rogue-lite scrap and shop (#1459, docs/specs/roguelite.md section 12), loaded through the test hook: the scrap in the
// run line on the map, a shop node with its items, a purchase and a removal paid in scrap, and Leave back to the map.
// Seed 7: the fight 0 leads to the elite 2, which leads to the shop 4.
const run = (state: object) => ({ seed: 7, army: 9, path: [0, 2], fighting: false, moves: [], end: '', specials: [1, 0, 0], placed: [], reward: false, event: false, scrap: 120, ...state });

test('the rogue-lite shop: scrap on the map, buy a marble, make a Heavy plain, leave, #1459', async ({ page }, testInfo) => {
  const panel = page.locator('#run-map');
  const line = panel.locator('.run-line');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await page.evaluate((s) => (window as any).__run(s), run({}));
  await expect(line).toHaveText('Rogue-lite run · army 9 marbles, 1 Heavy · 120 scrap · pick a fight');
  await shot(page, { path: testInfo.outputPath('roguelite-scrap-map.png') });

  await panel.getByRole('button', { name: 'Act 1, shop' }).click();
  await expect(line).toHaveText('Shop · 120 scrap');
  await expect(panel.locator('button[data-buy]')).toHaveCount(5);
  await shot(page, { path: testInfo.outputPath('roguelite-shop.png') });

  await panel.locator('button[data-buy="0"]').click(); // a marble
  await expect(panel.locator('button[data-buy]')).toHaveCount(4);
  await panel.getByRole('button', { name: /^Remove a Heavy/ }).click(); // the Heavy is plain again
  await expect(panel.locator('button[data-remove]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Leave' }).click();
  await expect(line).toHaveText(/^Rogue-lite run · army 10 marbles · \d+ scrap · pick a fight$/);
});
