import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1511: a wandering marble that touches the hero starts a wild fight the player can flee. Seed 3 has a marble within the hero's sight of the
// spawn. The marbles stand still (tick 0) until a spec sets the clock; the hero is put beside one with the test hook.
type Hooks = { __openworldFixture: (f: object) => void; __openworldEnemies: () => [number, number][]; __openworldWander: (tick: number | null) => void; __openworldDrawn: () => number };
const hooks = (page: Page) => ({
  enemies: () => page.evaluate(() => (window as unknown as Hooks).__openworldEnemies()),
  put: (hero: [number, number]) => page.evaluate((h) => (window as unknown as Hooks).__openworldFixture({ hero: h, troop: [] }), hero),
  wander: (tick: number | null) => page.evaluate((t) => (window as unknown as Hooks).__openworldWander(t), tick),
});
const data = (page: Page, key: string) => page.evaluate((k) => document.body.dataset[k], key);

async function opened(page: Page, query = ''): Promise<[number, number]> {
  await page.goto(`./?openworld=3&nodes=200${query}`);
  await page.locator('canvas[aria-label="Abalone board"]').waitFor();
  await expect.poll(() => data(page, 'openworldAt')).toBe('0,0');
  const [marble] = await hooks(page).enemies();
  return marble!;
}

test('a marble beside the hero starts the wipe, then the arena with Flee; Flee puts the hero back and the marble waits 5 s, #1511', async ({ page }) => {
  const [q, r] = await opened(page);
  await hooks(page).put([q + 1, r]);
  await expect(page.locator('#wild-wipe')).toBeVisible();
  await page.waitForTimeout(220);
  await shot(page, { path: 'test-results/openworld-wild-wipe.png' });
  await expect.poll(() => data(page, 'openworld')).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Flee' })).toBeVisible();
  expect(await data(page, 'fightBoard')).toBe('day');
  await expect(page.locator('#wild-wipe')).toBeHidden(); // a second in all
  await shot(page, { path: 'test-results/openworld-wild-fight.png' });
  await page.getByRole('button', { name: 'Flee' }).click();
  await expect.poll(() => data(page, 'openworldAt')).toBe(`${q + 1},${r}`);
  await expect(page.getByRole('button', { name: 'Flee' })).toBeHidden();
  expect(await data(page, 'fightBoard')).toBeUndefined();
  await page.waitForTimeout(600);
  expect(await data(page, 'openworld')).toBe('3'); // beside the marble, and no new fight: it is calm
});

test('a reload during a wild fight puts the hero back in the world on its cell, #1511', async ({ page }) => {
  const [q, r] = await opened(page);
  await hooks(page).put([q + 1, r]);
  await expect(page.getByRole('button', { name: 'Flee' })).toBeVisible();
  await page.reload();
  await expect.poll(() => data(page, 'openworldAt')).toBe(`${q + 1},${r}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as Hooks).__openworldDrawn())).toBeGreaterThan(0); // drawn: the 5 s calm starts on this draw (#1601)
  await expect(page.getByRole('button', { name: 'Flee' })).toBeHidden();
});

test('a marble that walks up to the hero starts the fight on the tick it arrives, and F flees, #1511', async ({ page }) => {
  await opened(page);
  const h = hooks(page);
  const home = (await h.enemies())[0]!;
  // The first tick at which the group stands away from home, and a cell beside it that is not beside home.
  let at: [number, number] | null = null;
  let tick = 0;
  for (tick = 1; tick < 400 && !at; tick++) {
    await h.wander(tick);
    at = (await h.enemies()).find((c) => c[0] !== home[0] || c[1] !== home[1]) ?? null;
  }
  tick -= 1;
  await h.wander(0);
  const near = ([[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]] as const).map(([a, b]): [number, number] => [at![0] + a, at![1] + b]).find((c) => Math.max(Math.abs(c[0] - home[0]), Math.abs(c[1] - home[1]), Math.abs(c[0] - home[0] + c[1] - home[1])) >= 2)!;
  await h.put(near);
  await page.waitForTimeout(300);
  expect(await data(page, 'openworld')).toBe('3'); // the marble is at home, two cells off
  await h.wander(tick);
  await expect.poll(() => data(page, 'openworld')).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Flee' })).toBeVisible();
  await page.keyboard.press('f');
  await expect.poll(() => data(page, 'openworldAt')).toBe(near.join(','));
});
