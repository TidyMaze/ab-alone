import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The cursed chest of the rogue-lite run (#1474, docs/specs/roguelite.md section 24), loaded through the test hook. Seed 13 deals the
// Cursed chest to an event at node 0 (the first fight of act 1).
const run = { seed: 13, army: 14, path: [0], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: true };

test('a cursed chest gives a relic and a curse that shows on the map and in the fight, #1474', async ({ page }) => {
  const map = page.locator('#run-map');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await page.evaluate((s) => (window as any).__run(s), run);
  await expect(map.locator('.run-line')).toHaveText('Event · Cursed chest');
  await expect(map.locator('button[data-choice]')).toHaveText([
    'Open it for its relic · +1 relic, cursed: marbles lost cost 2 for the next 2 fights',
    'Open it for its arms · +3 Heavys, cursed: marbles lost cost 2 for the next 2 fights',
    'Leave',
  ]);
  await shot(page, { path: 'test-results/roguelite-cursed-chest.png' });
  await map.locator('button[data-choice="0"]').click();
  await expect(map.locator('.run-line')).toHaveText('Rogue-lite run · army 14 marbles · cursed: marbles lost cost 2, 2 fights left · pick a fight');
  await expect(page.locator('#hud .relics .relic')).toHaveCount(1);

  await map.locator('button.node:not([disabled])').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  await expect(page.locator('#hud small')).toContainText('cursed: marbles lost cost 2, 2 fights left');
  await shot(page, { path: 'test-results/roguelite-cursed-fight.png' });
});

test('Leave takes no curse, #1474', async ({ page }) => {
  const map = page.locator('#run-map');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), run);
  await map.getByRole('button', { name: 'Leave' }).click();
  await expect(map.locator('.run-line')).toHaveText('Rogue-lite run · army 14 marbles · pick a fight');
});
