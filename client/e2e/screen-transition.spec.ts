import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1099, docs/specs/motion.md story 9: a boss fight cross-fades in on the base token and is live from the first frame; Reduced
// motion cuts. Opacity only, so the canvas keeps its box.

/** Starts the first boss and reports the canvas animations running at once, and whether the fight is already on. */
async function startBoss(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: /Boss fight/ }).click();
  return page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#boss-list button')!.click();
    const canvas = document.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    return {
      fades: canvas.getAnimations().map((a) => [(a.effect as KeyframeEffect).getTiming().duration, (a.effect as KeyframeEffect).getKeyframes().map((k) => k.opacity)]),
      live: document.body.dataset.boss !== undefined,
      box: [box.width, box.height],
    };
  });
}

test('a boss fight fades in on the base token and is live at once (#1099)', async ({ page }) => {
  const r = await startBoss(page);
  expect(r.fades).toEqual([[200, ['0', '1']]]);
  expect(r.live).toBe(true);
  expect(r.box[0]).toBeGreaterThan(0);
  await page.screenshot({ path: `${process.env.HOME}/.claude/ab-alone-lead/1099-screen-transitions/after.png` });
});

test('Reduced motion cuts the screen change (#1099)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const r = await startBoss(page);
  expect(r.fades).toEqual([]);
  expect(r.live).toBe(true);
});
