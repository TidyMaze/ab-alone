import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { openModes } from './modes';

// #1176: the hero and the troop of the Open world wear the player's marble skin of the ship, the enemies the shell skin. The test hook
// stands the state up (no walk). The hero is at the centre of the screen: the old glossy blue marble read bluer than red by about 22 of
// 255, the default Marble skin is neutral (about 3).
test('the hero of the Open world wears the ship skin, not the glossy blue marble, #1176', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  await page.evaluate(() =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [[-1, 0], [-1, 1]], enemies: [[2, 0], [2, -1]] }),
  );
  await page.waitForTimeout(1500); // the camera settles and the skin maps are on
  const { width, data } = PNG.sync.read(await page.screenshot({ clip: { x: 632, y: 350, width: 16, height: 16 } }));
  let blueOverRed = 0;
  for (let i = 0; i < width * width; i++) blueOverRed += data[i * 4 + 2]! - data[i * 4]!;
  expect(blueOverRed / (width * width)).toBeLessThan(12);
});
