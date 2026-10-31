import { expect, test, type Page } from '@playwright/test';

// #1093, docs/specs/motion.md story 3: at the end of a game the turn title pulses once on the celebrate token and the result line
// arrives a beat later. Reduced motion keeps the text and cuts the motion. A real ending is covered by the end-banner unit tests;
// here the shipped CSS is read on the HUD markup of an ended game.

const beat = (page: Page) =>
  page.evaluate(() => {
    document.body.dataset.over = 'win';
    document.querySelector('#hud')!.innerHTML = '<div class="turn"><span class="marker"></span><span>Black wins</span></div><div class="end">Well played.</div>';
    const read = (sel: string) => {
      const s = getComputedStyle(document.querySelector(sel)!);
      return { name: s.animationName, duration: s.animationDuration, delay: s.animationDelay };
    };
    return { title: read('#hud .turn span:last-child'), line: read('#hud .end') };
  });

test('the title pulses on the celebrate token, the line follows on the base token (#1093)', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  const { title, line } = await beat(page);
  expect(title).toMatchObject({ name: 'end-title', duration: '1.2s' });
  expect(line).toEqual({ name: 'end-line', duration: '0.2s', delay: '0.12s' });
});

test('Reduced motion keeps the text and cuts the beat (#1093)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  const { title, line } = await beat(page);
  expect([title.duration, line.duration]).toEqual(['0s', '0s']);
  await expect(page.locator('#hud .end')).toHaveText('Well played.');
});
