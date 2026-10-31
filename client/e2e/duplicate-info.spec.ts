import { expect, test } from '@playwright/test';

// #1038: each fact has one place on the screen at a time. On a phone held upright the ejected count is the pips
// alone: the score text is out of sight, and it stays in the accessibility tree as the one name of the count.

for (const viewport of [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
]) {
  test.describe(`a phone held upright ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('the ejected count is shown by the pips only, and the score text is out of sight', async ({ page }) => {
      await page.goto('./?bot=on');
      await page.locator('canvas').waitFor();
      const score = page.locator('#hud .score');
      // Against the bot the human is side 1 and wears the glass: White is named first (#1038, still in the accessibility tree).
      await expect(score).toHaveText('White ejected 0/6 · Black ejected 0/6');
      const box = await score.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(1); // clipped to a 1 px box: nothing shown on the screen
      expect(box!.height).toBeLessThanOrEqual(1);
      await expect(page.locator('#hud .pips > span')).toHaveCount(2);
      await expect(page.locator('#hud .pips > span.dark')).toHaveCount(1); // Black's marble colour
      await expect(page.locator('#hud .pips > span.pale')).toHaveCount(1); // White's marble colour
      expect((await page.locator('#hud .pips').boundingBox())!.width).toBeGreaterThan(100); // the pips are on screen
    });
  });
}
