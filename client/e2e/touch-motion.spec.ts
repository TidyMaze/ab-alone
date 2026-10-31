import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #1094, docs/specs/motion.md story 4: the Game modes sheet opens with a slide and fade on the base token, a pressed dock button
// eases on the instant token, and Reduced motion keeps both at 0 s. The sheet is pressable from the first frame.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('the sheet opens on the base token and a dock button eases on the instant token (#1094)', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  const modes = page.getByRole('button', { name: 'Game modes' });
  expect(await modes.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.08s');
  await openModes(page);
  const sheet = page.locator('#mode-menu');
  await expect(sheet).toBeVisible();
  const style = await sheet.evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration };
  });
  expect(style).toEqual({ name: 'sheet-in', duration: '0.2s' });
});

test('Reduced motion opens the sheet and presses the button at once (#1094)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  const modes = page.getByRole('button', { name: 'Game modes' });
  await openModes(page);
  expect(await page.locator('#mode-menu').evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0s');
  expect(await modes.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});
