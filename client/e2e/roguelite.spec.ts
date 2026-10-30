import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// The rogue-lite run (#798, docs/specs/roguelite.md) in the browser: Rogue-lite run in the mode menu shows the map, a
// pick starts its fight, and a run loaded through the test hook, an army of 9 in its fight, survives a reload.
test('the rogue-lite run: the map from the mode menu, a pick starts its fight, the army survives a reload, #798', async ({ page }, testInfo) => {
  const map = page.locator('#run-map');
  const note = page.locator('#hud small');
  await page.goto('./?nodes=50');
  await openModes(page);
  await page.getByRole('button', { name: 'Rogue-lite run' }).click();
  await expect(map).toBeVisible();
  await expect(map.locator('.run-line')).toHaveText('Rogue-lite run · army 14 marbles · pick a fight');
  await page.screenshot({ path: testInfo.outputPath('roguelite-map.png') });
  await map.getByRole('button', { name: 'Act 1, fight' }).and(page.locator(':enabled')).first().click();
  await expect(map).toBeHidden();
  await expect(note).toContainText('Rogue-lite run · act 1 fight · army 14 marbles');

  // An army of 9 in the fight of its first node: the back row and four more are gone, and a reload keeps it.
  await page.evaluate(() => (window as any).__run({ seed: 7, army: 9, path: [0], fighting: true, moves: [], end: '' }));
  await expect(note).toContainText('army 9 marbles');
  const backRow = () => page.evaluate(() => (window as any).__legal().some((m: any) => m.cells.some(([, r]: number[]) => r === 4)));
  expect(await backRow()).toBe(false);
  await page.reload();
  await expect(note).toContainText('Rogue-lite run · act 1 fight · army 9 marbles');
  expect(await backRow()).toBe(false);
});
