import { expect, test, type Page } from '@playwright/test';

// #1096, docs/specs/motion.md story 6: the boss bar drains on the slow token, a broken fragment bursts on the base token, the army
// chip to move flashes on the fast token; Reduced motion cuts the motion. The shipped CSS is read on a bar built in the page; a real
// ejection is covered by the bossbar.test unit tests.

const read = (page: Page) =>
  page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = 'boss-bar';
    bar.innerHTML = '<i class="frag broke"></i><span class="chip next"></span>';
    document.body.append(bar);
    const f = getComputedStyle(bar.querySelector('.frag')!);
    const c = getComputedStyle(bar.querySelector('.chip')!);
    return { drain: f.transitionDuration, burst: [f.animationName, f.animationDuration], flash: [c.animationName, c.animationDuration] };
  });

test('boss feedback follows the motion tokens (#1096)', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  expect(await read(page)).toEqual({ drain: '0.32s', burst: ['frag-burst', '0.2s'], flash: ['chip-flash', '0.12s'] });
});

test('Reduced motion cuts the boss feedback motion (#1096)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  expect(await read(page)).toEqual({ drain: '0s', burst: ['frag-burst', '0s'], flash: ['chip-flash', '0s'] });
});
