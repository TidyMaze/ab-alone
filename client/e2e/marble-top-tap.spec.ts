import { expect, test } from '@playwright/test';
import { paused } from './frameclock';

// #1668: a tap on the upper part of a marble selects it. The cell discs are flat, so the ray used to pass over one and fall to the
// console prop behind the board, which opened the lore panel in the middle of a fight. On a phone-size window.
test('a tap on the top of a marble selects it and opens no lore panel, #1668', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
  const cell = await page.evaluate(() => (window as any).__legal().find((m: { cells: number[][] }) => m.cells.length === 1).cells[0] as number[]);
  const at = await page.evaluate(([q, r]) => (window as any).__cellToScreen(q, r, 0.6), cell); // the marble's upper part
  await paused(page, async (frame) => {
    await page.mouse.click(at.x, at.y);
    await frame(16);
    expect(await page.evaluate(() => (window as any).__rings())).toEqual([cell]);
    expect(await page.evaluate(() => document.body.dataset.reading)).toBeUndefined();
  });
});
