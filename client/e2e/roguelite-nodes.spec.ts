import { expect, test } from '@playwright/test';
import { shot } from './shot';

// Elites, rests, unknown nodes that turn into events (#1463) and act bosses of the rogue-lite run (#800, docs/specs/roguelite.md
// sections 7 and 15) in the browser.
// Each step loads the run it needs through the test hook. Seed 3: the fight 1 leads to the rest 3, the treasure 4 (#1457)
// and the unknown 5 (an event), and its act 1 boss is reached by 0, 2 (an elite), 6 (an elite) and 9.
test('the rogue-lite run: elite, rest, unknown and boss nodes, an event, a rest and an act boss, #800, #1463', async ({ page }, testInfo) => {
  const map = page.locator('#run-map');
  const line = map.locator('.run-line');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  const run = { seed: 3, army: 9, path: [1], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false };
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await hook(run);
  for (const kind of ['elite', 'rest', 'unknown', 'boss']) await expect(map.getByRole('button', { name: `Act 1, ${kind}` }).first()).toBeVisible();
  await shot(page, { path: testInfo.outputPath('roguelite-map-nodes.png') });

  await hook({ ...run, specials: [0, 0, 1] }); // a Spark to give: every trade can be paid
  await map.locator('[data-node="5"]').click();
  await expect(line).toHaveText(/^Event · /);
  expect(await map.locator('button[data-choice]').count()).toBeGreaterThanOrEqual(2);
  await shot(page, { path: testInfo.outputPath('roguelite-event.png') });
  await map.getByRole('button', { name: 'Leave' }).click();
  await expect(line).toHaveText('Rogue-lite run · army 9 marbles, 1 Spark · pick a fight');

  await hook(run);
  await map.locator('[data-node="3"]').click();
  await expect(line).toHaveText('Rest site · rest or upgrade'); // the rest site's choice (#1458)
  await map.locator('button[data-rest]').click();
  await expect(line).toHaveText('Rogue-lite run · rested · army 14 marbles · pick a fight');
  await shot(page, { path: testInfo.outputPath('roguelite-rest.png') });

  await hook({ ...run, army: 14, path: [0, 2, 6, 9], fighting: true });
  await expect(page.locator('body')).toHaveAttribute('data-boss', /\w/);
  await expect(page.locator('#hud small')).toContainText('Rogue-lite run · act 1 boss · army 14 marbles');
});
