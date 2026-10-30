import { expect, test } from '@playwright/test';

// #920: the ?lights panel scrolls, and its Editor and Save buttons stayed at the end of the list, out of sight.
// They stick to the bottom of the panel, in its font, and are 44 px high on a coarse pointer.
for (const [name, viewport, mobile, height] of [
  ['a desktop window', { width: 1280, height: 720 }, false, 32],
  ['a phone', { width: 375, height: 812 }, true, 44],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });
    test('the Editor and Save buttons stay inside the visible panel', async ({ page }) => {
      await page.goto('./?bot=off&lights');
      const panel = page.locator('#light-panel');
      await panel.waitFor();
      const box = (await panel.boundingBox())!;
      for (const button of [panel.locator('button.editor'), panel.locator('button[aria-label="Save to sceneoverrides.json"]')]) {
        const b = (await button.boundingBox())!;
        expect(b.y).toBeGreaterThanOrEqual(box.y);
        expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height);
        expect(b.height).toBeGreaterThanOrEqual(height);
        expect(await button.evaluate((e) => getComputedStyle(e).fontFamily)).toBe(await panel.evaluate((e) => getComputedStyle(e).fontFamily));
      }
    });
  });
}
