import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The bonus room before an act boss of the rogue-lite run (#1473, docs/specs/roguelite.md section 26), loaded through the test hook.
// Seed 3: the act 1 boss, node 9, is reached by 0, 2 and 6.
const run = { seed: 3, army: 14, path: [0, 2, 6], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false };

test('an act won within its move budget opens a bonus room before the boss, #1473', async ({ page }, testInfo) => {
  const map = page.locator('#run-map');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await hook({ ...run, spent: [5, 0, 0, 0] });
  await expect(map.locator('.run-moves')).toHaveText(/^moves 5 of \d+ · bonus room open$/);
  await map.evaluate((e) => (e.scrollTop = 0)); // the run line and the budget at the top
  await shot(page, { path: testInfo.outputPath('roguelite-budget.png') });

  await map.locator('[data-node="9"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'bonus');
  await expect(map.locator('.run-line')).toHaveText('Bonus room · fast play pays');
  await expect(map.locator('button[data-bonus]')).toContainText('scrap');
  await shot(page, { path: testInfo.outputPath('roguelite-bonus-room.png') });
  await map.locator('button[data-bonus]').click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  await expect(page.locator('body')).toHaveAttribute('data-boss', /\w/);
  await expect(page.locator('#hud .relics .relic')).toHaveCount(1);
  await expect(page.locator('#hud small')).not.toContainText('moves');

  await hook({ ...run, spent: [9999, 0, 0, 0] }); // over the budget: the room is shut
  await expect(map.locator('.run-moves')).toHaveText(/^moves 9999 of \d+ · bonus room closed$/);
  await map.locator('[data-node="9"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  await expect(page.locator('#hud .relics .relic')).toHaveCount(0);

  await hook(run); // a run saved before the room has no count
  await expect(map.locator('.run-moves')).toHaveCount(0);
  await map.locator('[data-node="9"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
});

test('a fight shows the budget and the count of its act in the HUD, #1473', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), { ...run, path: [0], fighting: true, spent: [7, 0, 0, 0] });
  await expect(page.locator('#hud small')).toContainText(/moves 7 of \d+ · bonus room open/);
});
