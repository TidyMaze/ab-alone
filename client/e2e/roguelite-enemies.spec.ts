import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// The varied enemy armies of the rogue-lite run (#1462, docs/specs/roguelite.md section 14), loaded through the test hook.
// Seed 3: the fight 0 (a Belgian daisy with a Spark), the elite 2 (The Artificer, German daisy) and the elite 6 (The Brute,
// wedge). A run without `enemies` is one saved before: the plain army.
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};
const run = { seed: 3, army: 14, path: [], fighting: false, moves: [], end: '', specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [], reward: false, enemies: true };

test('the rogue-lite foes: a formation and special marbles in a fight, a named elite on the map and in the HUD, #1462', async ({ page }) => {
  const marks = () => page.evaluate(() => document.body.dataset.specials);
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__run);
  await hook({ ...run, path: [0, 2], fighting: false });
  await expect(page.locator('#run-map button[data-node="6"]')).toHaveAccessibleName('Act 1, elite, The Brute');
  await expect(page.locator('#run-map button[data-node="6"]')).toHaveText('EliteBrute');
  await shot(page, { path: 'test-results/1462-elite-map.png' });

  await hook({ ...run, path: [0], fighting: true });
  await expect(page.locator('#hud small')).toContainText('Rogue-lite run · act 1 fight · Belgian daisy · army 14 marbles');
  expect(await marks()).toBe('3,-4,3'); // a Spark
  await freshDraw(page);
  await shot(page, { path: 'test-results/1462-fight-after.png' });

  await hook({ ...run, path: [0, 2], fighting: true });
  await expect(page.locator('#hud small')).toContainText('Rogue-lite run · act 1 elite · The Artificer · German daisy · army 14 marbles');
  expect((await marks())!.split(' ')).toHaveLength(2); // a Spark and a Bomb
  await freshDraw(page);
  await shot(page, { path: 'test-results/1462-elite-fight.png' });

  await hook({ ...run, enemies: undefined, path: [0], fighting: true }); // a run saved before: the plain army
  await expect(page.locator('#hud small')).toContainText('Rogue-lite run · act 1 fight · army 14 marbles');
  expect(await marks()).toBe('');
  await freshDraw(page);
  await shot(page, { path: 'test-results/1462-fight-before.png' });

  await page.reload(); // the elite fight resumes with its army
  await page.waitForFunction(() => (window as any).__run);
  await expect(page.locator('#hud small')).toContainText('army 14 marbles');
});
