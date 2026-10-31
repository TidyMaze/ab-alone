import { expect, test, type Page } from '@playwright/test';

// Bug #922: on a touch screen (a coarse pointer) every button of the column is a touch target of at least 44 px, the
// toolbar rows are even, the light sliders are 32 px high in their 44 px rows, and the gap between two buttons is 8 px.
// Bug #904: Reset lights spans the settings menu on a phone, and the open menu stops above the clipboard band (8 px
// above it) and keeps its Reset lights row reachable, held sideways at 800x400 and 1280x720 too.

const sizes = [
  { name: '360x780', viewport: { width: 360, height: 780 } },
  { name: '375x812', viewport: { width: 375, height: 812 } },
  { name: '390x844', viewport: { width: 390, height: 844 } },
  { name: '411x782', viewport: { width: 411, height: 782 } },
  { name: '800x400 held sideways', viewport: { width: 800, height: 400 } },
  { name: '1280x720 held sideways, a touch screen', viewport: { width: 1280, height: 720 } },
];

// The visible elements of a selector, their names and boxes, read in the page.
const boxesOf = (page: Page, selector: string) =>
  page.evaluate((sel) =>
    [...document.querySelectorAll(sel)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { name: el.id || el.getAttribute('aria-label') || el.textContent!.trim(), left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height };
      }), selector);

for (const { name, viewport } of sizes) {
  test.describe(`a touch screen at ${name}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test(`every button of the column is a 44 px target, and the toolbar is even, bug #922`, async ({ page }) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.locator('#settings')).toBeEnabled();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      // #1032: the column's buttons are the thumb dock's (the dock holds them now, the top column keeps the cog).
      const buttons = await boxesOf(page, '#dock > button');
      expect(buttons.map((b) => b.name)).toContain('hint');
      const small = buttons.filter((b) => b.w < 43.9 || b.h < 43.9).map((b) => `${b.name} ${b.w}x${b.h}`);
      expect(small, 'the dock buttons under 44 px').toEqual([]);
      // The dock's buttons share one height (the Auto-play sixth one included when it is offered).
      const heights = buttons.map((b) => b.h);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      // Two buttons side by side keep at least 8 px between them.
      const rows = new Map<number, typeof buttons>();
      for (const b of buttons) rows.set(Math.round(b.top), [...(rows.get(Math.round(b.top)) ?? []), b]);
      const tight: string[] = [];
      for (const row of rows.values()) {
        const sorted = [...row].sort((a, b) => a.left - b.left);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].left - sorted[i - 1].right < 8 - 0.5) tight.push(`${sorted[i - 1].name} and ${sorted[i].name}`);
        }
      }
      expect(tight, 'buttons closer than 8 px').toEqual([]);
    });

    test(`the settings menu: 44 px items, sliders 32 px high in 44 px rows, Reset lights spans the row, bugs #904 #922`, async ({ page }) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.locator('#settings')).toBeEnabled();
      await page.locator('#settings').click();
      await expect(page.locator('#settings-menu')).toBeVisible();
      const items = await boxesOf(page, '#settings-menu button');
      const small = items.filter((b) => b.w < 43.9 || b.h < 43.9).map((b) => `${b.name} ${b.w}x${b.h}`);
      expect(small, 'the menu items under 44 px').toEqual([]);
      const rows = await boxesOf(page, '#settings-menu .setting-lights');
      expect(rows.length).toBe(3);
      for (const row of rows) expect(row.h, `${row.name} row`).toBeGreaterThanOrEqual(43.9);
      const sliders = await page.evaluate(() =>
        [...document.querySelectorAll('#settings-menu .setting-lights input')].map((el) => el.getBoundingClientRect().height));
      for (const h of sliders) expect(h, 'a light slider').toBeGreaterThanOrEqual(31.9);
      // Reset lights spans the row of the lights: as wide as the sliders' rows, within 1 px.
      const reset = await boxesOf(page, '#level-reset');
      expect(reset.length).toBe(1);
      expect(Math.abs(reset[0].w - rows[0].w), 'Reset lights width against a light row').toBeLessThanOrEqual(1);
      expect(reset[0].h).toBeGreaterThanOrEqual(43.9);
      // #1032: Copy diagnostics is the last row of the menu (its own band at the corner is gone), 44 px high, inside it.
      const [menu] = await boxesOf(page, '#settings-menu');
      const [clip] = await boxesOf(page, '#copy-diagnostics');
      expect(clip.h, 'Copy diagnostics row').toBeGreaterThanOrEqual(43.9);
      expect(await page.evaluate(() => document.getElementById('settings-menu')!.lastElementChild!.id), 'the last row').toBe('copy-diagnostics');
      // Reached by scrolling the menu, the Reset lights row is whole, inside the menu and on the screen.
      await page.locator('#level-reset').scrollIntoViewIfNeeded();
      const [after] = await boxesOf(page, '#level-reset');
      const [box] = await boxesOf(page, '#settings-menu');
      expect(after.top).toBeGreaterThanOrEqual(box.top - 0.5);
      expect(after.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
      expect(after.bottom).toBeLessThanOrEqual(viewport.height);
    });
  });
}
