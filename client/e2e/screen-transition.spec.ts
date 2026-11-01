import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1099, docs/specs/motion.md story 9: the canvas cross-fades on the base token when the Open world is entered or left. Opacity only,
// so the game is live while it runs. Reduced motion cuts it. The page and CSS are read in the browser; the entry logic has unit tests.

async function ready(page: Page, reduced = false): Promise<void> {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
}

const canvasCue = (page: Page, openworld: boolean) =>
  page.evaluate((on) => {
    if (on) document.body.dataset.openworld = 'test';
    else delete document.body.dataset.openworld;
    const s = getComputedStyle(document.querySelector('canvas')!);
    return { name: s.animationName, duration: s.animationDuration };
  }, openworld);

test('the canvas fades in on the base token on entering and leaving the Open world (#1099)', async ({ page }) => {
  await ready(page);
  expect(await canvasCue(page, true)).toEqual({ name: 'screen-in-world', duration: '0.2s' });
  expect(await canvasCue(page, false)).toEqual({ name: 'screen-in', duration: '0.2s' });
});

test('the fade never blocks input: the canvas keeps its pointer events (#1099)', async ({ page }) => {
  await ready(page);
  expect(await page.locator('canvas').evaluate((c) => getComputedStyle(c).pointerEvents)).not.toBe('none');
});

test('Reduced motion cuts the fade to a hard cut (#1099)', async ({ page }) => {
  await ready(page, true);
  expect((await canvasCue(page, true)).duration).toBe('0s');
});

test('the fade really plays when the Open world is entered by its button (#1099)', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.evaluate(() => {
    (window as any).__started = [];
    document.addEventListener('animationstart', (e) => (window as any).__started.push((e as AnimationEvent).animationName), true);
  });
  await page.locator('#openworld').click();
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__started)).toContain('screen-in-world');
});
