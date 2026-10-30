import { expect, test } from '@playwright/test';

// Elites, rests, events and act bosses of the rogue-lite run (#800, docs/specs/roguelite.md section 7) in the browser.
// Each step loads the run it needs through the test hook. Seed 3: the fight 1 leads to the rest 3 and the events 4 and
// 5, and its act 1 boss is reached by 0, 2 (an elite), 6 (an elite) and 9.
test('the rogue-lite run: elite, rest, event and boss nodes, an event, a rest and an act boss, #800', async ({ page }, testInfo) => {
  const map = page.locator('#run-map');
  const line = map.locator('.run-line');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  const run = { seed: 3, army: 9, path: [1], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false };
  await page.goto('./?bot=off');
  await hook(run);
  for (const kind of ['elite', 'rest', 'event', 'boss']) await expect(map.getByRole('button', { name: `Act 1, ${kind}` }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('roguelite-map-nodes.png') });

  await map.locator('[data-node="4"]').click();
  await expect(line).toHaveText(/^Event · /);
  await page.screenshot({ path: testInfo.outputPath('roguelite-event.png') });
  await map.getByRole('button', { name: 'Leave' }).click();
  await expect(line).toHaveText('Rogue-lite run · army 9 marbles · pick a fight');

  await hook(run);
  await map.locator('[data-node="3"]').click();
  await expect(line).toHaveText('Rogue-lite run · rested · army 14 marbles · pick a fight');
  await page.screenshot({ path: testInfo.outputPath('roguelite-rest.png') });

  await hook({ ...run, army: 14, path: [0, 2, 6, 9], fighting: true });
  await expect(page.locator('body')).toHaveAttribute('data-boss', /\w/);
  await expect(page.locator('#hud small')).toContainText('Rogue-lite run · act 1 boss · army 14 marbles');
});
