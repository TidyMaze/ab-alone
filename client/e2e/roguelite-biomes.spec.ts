import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The rogue-lite biome exits (#1472, docs/specs/roguelite.md section 16), loaded through the test hook: the two exits after the
// act 1 boss, a pick that tints the map, and an act 2 fight whose board has the biome's holes. Seed 3: the act 1 boss 9 is
// reached by 0, 2 and 6, and leads to the first fight 10 of act 2.
const run = (state: object) => ({ seed: 3, army: 12, path: [0, 2, 6, 9], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false, best: 0, enemies: true, exits: true, ...state });

test('the biome exits: two exits after the act 1 boss, a tinted map, a fight with holes in its board, #1472', async ({ page }, testInfo) => {
  const panel = page.locator('#run-map');
  const line = panel.locator('.run-line');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready

  await hook(run({ exit: true }));
  await expect(page.locator('body')).toHaveAttribute('data-run', 'exit');
  await expect(line).toHaveText('Act 1 done · pick the exit to act 2');
  await expect(panel.locator('button[data-exit]')).toHaveCount(2);
  await expect(page.locator('body')).not.toHaveAttribute('data-biome', /./); // act 1 is the Meadow
  await shot(page, { path: testInfo.outputPath('roguelite-exits.png') });

  const exit = panel.locator('button[data-exit]').first();
  const [code, id] = [Number(await exit.getAttribute('data-exit')), await exit.getAttribute('data-biome')];
  await exit.click();
  await expect(page.locator('body')).toHaveAttribute('data-run', 'map');
  await expect(page.locator('body')).toHaveAttribute('data-biome', id!);
  await expect(line).toContainText('pick a fight');

  await hook(run({ path: [0, 2, 6, 9, 10], fighting: true, biomes: [code] }));
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  await expect(page.locator('body')).toHaveAttribute('data-biome', id!);
  const holes = await page.evaluate(() => (window as any).__board().filter((c: number) => c === 3).length); // 3: a vanished cell
  expect(holes).toBeGreaterThan(0);
  await shot(page, { path: testInfo.outputPath('roguelite-biome-fight.png') });
});
