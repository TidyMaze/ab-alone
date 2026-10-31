import { expect, test, type Page } from '@playwright/test';

// #1095, docs/specs/motion.md story 5: a pip newly out moves on the base token; Reduced motion keeps the pip and cuts the motion.
// A real ejection is covered by the hud.test unit tests (the `fresh` class); here the shipped CSS is read on a `.pip.out.fresh` in the HUD.

const fresh = (page: Page) =>
  page.evaluate(() => {
    const pip = document.createElement('span');
    pip.className = 'pip out fresh';
    document.querySelector('#hud')!.append(pip);
    const s = getComputedStyle(pip);
    return { name: s.animationName, duration: s.animationDuration, timing: s.animationTimingFunction };
  });

test('a fresh pip moves on the base token with the out easing (#1095)', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  expect(await fresh(page)).toEqual({ name: 'pip-out', duration: '0.2s', timing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
});

test('Reduced motion keeps the pip and cuts the motion (#1095)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  expect((await fresh(page)).duration).toBe('0s');
});
