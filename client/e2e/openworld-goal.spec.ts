import { expect, test } from '@playwright/test';
import { lowTierOnCi, showHud } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1530: the Open world says its goal on arrival, one sentence and the bearing to the nearest tower, and keeps the controls behind a
// collapsed hint (one tap on its summary, or H). The plate must not cover the hero on a phone, upright or on its side.

const enter = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  await showHud(page, '#openworld-goal'); // the plate folds 8 s after the entry, before a slow runner gets here (#1436)
};

test('the world says its goal and the bearing to the nearest tower, the controls are collapsed, and H opens and closes them', async ({ page }, testInfo) => {
  await enter(page);
  await expect(page.locator('#openworld-goal')).toHaveText(/^Goal: beat the 15 towers of Hollow\. One medal each\.$/);
  await expect(page.locator('#openworld-bearing')).toHaveText(/^Nearest tower: \d+ cells, (to the |straight )(upper |lower )?\w+\.$/);
  await expect(page.locator('#openworld-medals')).toHaveText('Medals 0 / 15');
  await expect(page.locator('#openworld-dungeon')).toHaveText('Nearest tower');
  const hint = page.locator('#openworld-controls .keys-hint').last();
  await expect(hint).toBeHidden(); // collapsed
  await shot(page, { path: testInfo.outputPath('1530-world-desktop.png') });
  await page.keyboard.press('h');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('H to close this');
  await page.keyboard.press('h');
  await expect(hint).toBeHidden();
  await page.locator('#openworld-controls summary').click(); // a tap does the same
  await expect(hint).toBeVisible();
  await page.locator('#openworld-controls summary').click();
  await expect(hint).toBeHidden();
  // The bearing follows the hero: next to the first tower it is one cell away.
  const [q, r] = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ')[0]!.split(',').map(Number) as [number, number];
  await page.evaluate(([q, r]) => (window as any).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] }), [q, r]);
  await expect(page.locator('#openworld-bearing')).toHaveText(/^Nearest tower: 1 cell, /);
});

for (const [name, viewport] of [['upright 390 by 844', { width: 390, height: 844 }], ['landscape 844 by 390', { width: 844, height: 390 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('the plate on arrival fits the screen and leaves the hero in the middle uncovered', async ({ page }, testInfo) => {
      await enter(page);
      const box = (await page.locator('#openworld-hud').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      const [cx, cy] = [viewport.width / 2, viewport.height / 2];
      const covers = box.x < cx + 40 && box.x + box.width > cx - 40 && box.y < cy + 40 && box.y + box.height > cy - 40;
      expect(covers, `the plate ${JSON.stringify(box)} covers the hero at ${cx},${cy}`).toBe(false);
      await expect(page.locator('#openworld-controls .tap-hint')).toBeHidden();
      await shot(page, { path: testInfo.outputPath(`1530-world-${viewport.width}.png`) });
      await page.locator('#openworld-controls summary').tap();
      await expect(page.locator('#openworld-controls .tap-hint')).toBeVisible();
      await shot(page, { path: testInfo.outputPath(`1530-world-${viewport.width}-controls.png`) });
    });
  });
}
