import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1101, #1102: the Open world water has shore foam and ripples, the trees sway, with no extra draw. Seed 1 has a lake with a forest
// beside it at (26, 21); the page marks what moves (`data-openworld-motion`, webdriver pages only). Reduced motion and the low tier
// move nothing.
async function enter(page: Page, query = ''): Promise<void> {
  await page.setViewportSize({ width: 480, height: 270 }); // software WebGL: a frame costs by its pixels
  await page.goto(`./?bot=off&openworld=1${query}`);
  await page.locator('canvas').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [26, 21], troop: [], enemies: [] }));
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('26,21');
}
const moves = (page: Page) => page.evaluate(() => document.body.dataset.openworldMotion);

test('the shore foam and the trees move, two frames differ, #1101 #1102', async ({ page }) => {
  await enter(page);
  await expect.poll(() => moves(page)).toBe('water,trees');
  const first = await page.screenshot();
  await expect.poll(async () => !(await page.screenshot()).equals(first), { timeout: 8000 }).toBe(true);
});

test('nothing moves under reduced motion: two frames are the same, #1101 #1102', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await expect.poll(() => moves(page)).toBe('');
  await page.waitForTimeout(1500); // the camera has settled (it snaps under reduced motion)
  const first = await page.screenshot();
  await page.waitForTimeout(1500);
  expect((await page.screenshot()).equals(first)).toBe(true);
});

test('the low tier draws no foam, ripple or sway, #1101 #1102', async ({ page }) => {
  await enter(page, '&quality=low');
  await expect.poll(() => page.evaluate(() => document.body.dataset.tier)).toBe('low');
  await expect.poll(() => moves(page)).toBe('');
});
