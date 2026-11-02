import { expect, test, type Page } from '@playwright/test';

// Relics of the rogue-lite run (#1457, docs/specs/roguelite.md section 9) in the browser, each step loaded through the
// test hook: the relic bar in the HUD on the map, a treasure's relic taken into it, an act boss's offer of 3, and the bar
// in a fight. Seed 3: the fight 1 leads to the treasure 4; its act 1 boss 9 is reached by 0, 2 and 6.
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};
const run = (state: object) => ({ seed: 3, army: 12, path: [1], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false, best: 3, relics: [], relic: false, ...state });

test('the rogue-lite relics: the bar, a treasure, a boss offer and a fight, #1457', async ({ page }) => {
  const panel = page.locator('#run-map');
  const bar = page.locator('#hud .relics .relic');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await hook(run({ relics: [0, 4] }));
  await expect(bar).toHaveCount(2);
  await expect(bar.first()).toHaveAttribute('aria-label', /^Gyroscope: /);
  await panel.getByRole('button', { name: 'Act 1, treasure' }).click();
  await expect(panel.locator('.run-line')).toHaveText('Treasure · a chest holds a relic');
  await panel.locator('button[data-relic]').click();
  await expect(bar).toHaveCount(3);
  await expect(page.locator('body')).toHaveAttribute('data-run', 'map');
  await freshDraw(page);
  await page.screenshot({ path: 'test-results/roguelite-relic-bar.png' });

  await hook(run({ path: [0, 2, 6, 9], reward: true, relic: true, relics: [0, 4, 1] }));
  await expect(panel.locator('.run-line')).toHaveText('Boss beaten · pick a relic');
  await expect(panel.locator('button[data-relic]')).toHaveCount(3);
  await freshDraw(page);
  await page.screenshot({ path: 'test-results/roguelite-relic-offer.png' });
  await panel.locator('button[data-relic]').first().click();
  await expect(panel.locator('.run-line')).toHaveText('Fight won · pick a reward');
  await expect(bar).toHaveCount(4);

  await hook(run({ path: [0], fighting: true, relics: [0, 4, 1] }));
  await expect(page.locator('body')).toHaveAttribute('data-run', 'fight');
  await expect(bar).toHaveCount(3);
  await freshDraw(page);
  await page.screenshot({ path: 'test-results/roguelite-relic-fight.png' });
});

// Bug #1477: on a portrait phone the map plate ended under the bottom dock (View, Replay, Modes). It ends above the dock
// and scrolls inside itself, so the third relic offer button can be reached and pressed.
test('on a portrait phone the run plate ends above the dock and the third relic can be pressed, #1477', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.locator('#run-map');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), run({ path: [0, 2, 6, 9], reward: true, relic: true, relics: [0, 4, 1] }));
  await expect(panel.locator('button[data-relic]')).toHaveCount(3);
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const dock = await box('#dock');
  expect((await box('#run-map')).y + (await box('#run-map')).height).toBeLessThanOrEqual(dock.y);
  const third = panel.locator('button[data-relic]').nth(2);
  await third.scrollIntoViewIfNeeded();
  const b = (await third.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(dock.y);
  await third.click();
  await expect(panel.locator('.run-line')).toHaveText('Fight won · pick a reward');
});
