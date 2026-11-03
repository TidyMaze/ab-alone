import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// An act boss fight carries the army's build (#1494, docs/specs/roguelite.md section 28), loaded through the test hook: the
// special marbles are placed on The Hull's board, play with their marks, and Fall back gives a turn back; The Echo takes none.
// Seed 4: the act 1 boss is The Hull, reached by the nodes 0, 3, 6 and 10. Seed 5: The Echo, by 0, 4, 6 and 9.
// Waits for a draw that began after this call (#435), so a screenshot shows the board as it stands.
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};
const run = (state: object) => ({ seed: 4, army: 14, path: [0, 3, 6, 10], fighting: true, moves: [], end: '', specials: [2, 1, 1], placed: [], reward: false, ...state });

test('an act boss fight places the special marbles on its board, fights with them and falls back, #1494', async ({ page }) => {
  const panel = page.locator('#run-map');
  const marks = () => page.evaluate(() => document.body.dataset.specials);
  const click = (q: number, r: number) => page.evaluate(([a, b]) => (window as any).__click(a, b), [q, r]);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__run);
  await page.evaluate((state) => (window as any).__run(state), run({ tactics: [2, 4], relics: [0] }));
  await expect(page.locator('body')).toHaveAttribute('data-boss', 'hull');
  await expect(panel.locator('.run-line')).toHaveText('Place your special marbles');
  await panel.getByRole('button', { name: /Heavy/ }).click();
  await click(0, 4);
  await click(-1, 4);
  await panel.getByRole('button', { name: /Anchor/ }).click();
  await click(1, 3);
  await panel.getByRole('button', { name: /Spark/ }).click();
  await click(-2, 4);
  expect(await marks()).toBe('-2,4,3 -1,4,1 0,4,1 1,3,2');
  await freshDraw(page);
  await shot(page, { path: 'test-results/roguelite-boss-placed.png' });

  // The first move closes the placement; both sides are played by hand (?bot=off).
  const start = await page.evaluate(() => (window as any).__board() as number[]);
  await click(0, 2);
  await click(0, 1);
  await expect(panel).toBeHidden();
  await click(0, -2);
  await click(0, -1);
  expect(await marks()).toBe('-2,4,3 -1,4,1 0,4,1 1,3,2');
  const bar = page.locator('#hud .tactics button');
  await expect(bar).toHaveCount(2);
  await expect(bar.nth(0)).toBeDisabled(); // Freeze skips a turn the boss's clock counts
  await expect(bar.nth(1)).toBeEnabled();
  await freshDraw(page);
  await shot(page, { path: 'test-results/roguelite-boss-fight.png' });
  await bar.nth(1).click(); // Fall back
  expect(await page.evaluate(() => (window as any).__board() as number[])).toEqual(start);
  expect(await page.evaluate(() => (window as any).__plies())).toBe(3);
  await expect(bar).toHaveCount(1);
  expect(await marks()).toBe('-2,4,3 -1,4,1 0,4,1 1,3,2');
});

test('an act boss that takes no build starts its fight at once, #1494', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__run);
  await page.evaluate((state) => (window as any).__run(state), run({ seed: 5, path: [0, 4, 6, 9] }));
  await expect(page.locator('body')).toHaveAttribute('data-boss', 'echo');
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  expect(await page.evaluate(() => document.body.dataset.specials)).toBe('');
});

// The six act bosses whose hooks move marbles take the build too (#1495): each stands the placement of the special marbles on
// its own board, and the mark sits on the marble pressed. [boss, run seed, the nodes to its act 1 boss]
const MOVERS = [
  ['magnetizer', 0, [0, 3, 5, 7]],
  ['pulsar', 2, [0, 3, 6, 10]],
  ['assembly', 7, [0, 2, 4, 7]],
  ['core', 56, [0, 4, 7, 9]],
  ['dual', 16, [0, 4, 7, 10]],
  ['ballast', 6, [0, 4, 6, 10]],
] as const;
for (const [id, seed, path] of MOVERS) {
  test(`${id} takes the army's special marbles in its act boss fight, #1495`, async ({ page }) => {
    await page.goto('./?bot=off');
    await page.waitForFunction(() => (window as any).__run);
    await page.evaluate((state) => (window as any).__run(state), run({ seed, path }));
    await expect(page.locator('body')).toHaveAttribute('data-boss', id);
    await expect(page.locator('#run-map .run-line')).toHaveText('Place your special marbles');
    const [q, r] = await page.evaluate(() => (window as any).__legal()[0].cells[0] as [number, number]);
    await page.locator('#run-map').getByRole('button', { name: /Heavy/ }).click();
    await page.evaluate(([a, b]) => (window as any).__click(a, b), [q, r]);
    expect(await page.evaluate(() => document.body.dataset.specials)).toBe(`${q},${r},1`);
    if (id === 'pulsar') {
      await freshDraw(page);
      await shot(page, { path: 'test-results/roguelite-boss-pulsar-placed.png' });
    }
  });
}

test('the map says before the fight whether the boss takes the build, #1495', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__run);
  const tip = async (state: object) => {
    await page.evaluate((s) => (window as any).__run(s), state);
    return page.locator('#run-map button[data-node-kind="boss"]').first().getAttribute('data-tip');
  };
  expect(await tip(run({ fighting: false, path: [0, 3, 6] }))).toContain('Boss: The Hull · takes your build');
  await page.locator('#run-map button[data-node-kind="boss"]').first().focus(); // the tip shows on focus too
  await freshDraw(page);
  await shot(page, { path: 'test-results/roguelite-boss-tip.png' });
  expect(await tip(run({ seed: 5, fighting: false, path: [0, 4, 6] }))).toContain('Boss: The Echo · fights without your build');
});
