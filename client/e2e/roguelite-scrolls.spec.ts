import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The rogue-lite scrolls of power (#1471, docs/specs/roguelite.md section 23), loaded through the test hook: the scroll
// screen after the act 1 boss, a scroll taken grows its affinity and joins the HUD next to the relic bar, and the map goes on.
// Seed 3: the act 1 boss 9 is reached by 0, 2 and 6.
const run = (state: object) => ({ seed: 3, army: 12, path: [0, 2, 6, 9], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false, best: 0, relics: [1], ...state });

test('a scroll of power after the act boss grows an affinity, shown next to the relics, #1471', async ({ page }, testInfo) => {
  const panel = page.locator('#run-map');
  const hook = (state: object) => page.evaluate((s) => (window as any).__run(s), state);
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready

  await hook(run({ scroll: true }));
  await expect(page.locator('body')).toHaveAttribute('data-run', 'scroll');
  await expect(panel.locator('.run-line')).toHaveText('Act 1 done · pick a scroll of power');
  await expect(panel.locator('button[data-scroll]')).toHaveCount(3);
  await shot(page, { path: testInfo.outputPath('roguelite-scroll.png') });

  await panel.locator('button[data-scroll="0"]').click(); // Force
  await expect(page.locator('body')).toHaveAttribute('data-run', 'map');
  await expect(page.locator('#hud .affinities .affinity')).toHaveAttribute('title', 'Force 1: Heavy and Heavy+ weigh 1 more in a push');
  await expect(page.locator('#hud .relics')).toBeVisible();
  await shot(page, { path: testInfo.outputPath('roguelite-affinity.png') });
});
