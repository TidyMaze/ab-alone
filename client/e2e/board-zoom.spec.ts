import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// #1567: one tap on a phone held upright takes the board from the whole of it, rim and all, to a closer view where every
// marble is at least 34 px wide and all 61 cells stay on the window. It stays on until toggled off, per device, and never
// blocks a move. Desktop and landscape are unchanged.

// Every cell's marble (0.92 of the cell spacing) and its disc on the window, as the camera draws them.
const cells = (page: Page) =>
  page.evaluate(() => {
    const toScreen = (q: number, r: number) => (window as any).__cellToScreen(q, r) as { x: number; y: number };
    const out: { w: number; left: number; right: number; top: number; bottom: number }[] = [];
    for (let r = -4; r <= 4; r++)
      for (let q = Math.max(-4, -4 - r); q <= Math.min(4, 4 - r); q++) {
        const a = toScreen(q, r);
        const b = toScreen(q + 1, r);
        const w = 0.92 * Math.hypot(b.x - a.x, b.y - a.y);
        out.push({ w, left: a.x - w / 2, right: a.x + w / 2, top: a.y - w / 2, bottom: a.y + w / 2 });
      }
    return out;
  });
const frame = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const widest = (all: { w: number }[]) => ({ min: Math.min(...all.map((c) => c.w)), mid: all[30]!.w, max: Math.max(...all.map((c) => c.w)) });

for (const [width, height] of [
  [390, 844],
  [360, 800],
]) {
  test.describe(`a phone ${width} by ${height} held upright`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test('one tap brings every marble to 34 px or more with all 61 cells on the window, a second tap goes back, #1567', async ({ page }) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      const zoom = page.getByRole('button', { name: 'Zoom the board' });
      await expect(zoom).toBeVisible();
      await expect(zoom).toHaveAttribute('aria-pressed', 'false');
      const box = (await zoom.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await frame(page);
      const whole = await cells(page);
      await zoom.click();
      await expect(zoom).toHaveAttribute('aria-pressed', 'true');
      await frame(page);
      const closer = await cells(page);
      const measured = { size: `${width}x${height}`, whole: widest(whole), closer: widest(closer) };
      console.log('1567 marble widths', JSON.stringify(measured));
      if (process.env.ZOOM_OUT) writeFileSync(process.env.ZOOM_OUT + `/widths-${width}.json`, JSON.stringify(measured));
      expect(closer).toHaveLength(61);
      expect(measured.closer.min).toBeGreaterThanOrEqual(34);
      expect(measured.closer.min).toBeGreaterThan(measured.whole.min);
      for (const c of closer) {
        expect(c.left).toBeGreaterThanOrEqual(0);
        expect(c.right).toBeLessThanOrEqual(width);
        expect(c.top).toBeGreaterThanOrEqual(0);
        expect(c.bottom).toBeLessThanOrEqual(height);
      }
      await zoom.click();
      await expect(zoom).toHaveAttribute('aria-pressed', 'false');
      await frame(page);
      expect(widest(await cells(page))).toEqual(measured.whole);
    });

    test('taps on marbles select and move in both states, #1567', async ({ page }) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.locator('#hud')).toContainText('Black to move');
      const tap = async (q: number, r: number) => {
        const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
        await page.mouse.click(p.x, p.y);
      };
      await page.getByRole('button', { name: 'Zoom the board' }).click();
      await frame(page);
      await tap(0, 2); // a Black marble
      await tap(0, 1);
      await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(1);
      await page.getByRole('button', { name: 'Zoom the board' }).click();
      await frame(page);
      await tap(0, -2); // a White marble, the whole board again
      await tap(0, -1);
      await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(2);
    });

    test('the closer view stays on after a reload, per device, #1567', async ({ page }) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: 'Zoom the board' }).click();
      expect(await page.evaluate(() => localStorage.getItem('ab-alone.board-zoom'))).toBe('on');
      await page.reload();
      await page.locator('canvas').waitFor();
      await expect(page.getByRole('button', { name: 'Zoom the board' })).toHaveAttribute('aria-pressed', 'true');
      await frame(page);
      expect(widest(await cells(page)).min).toBeGreaterThanOrEqual(34);
    });
  });
}

test.describe('desktop and landscape', () => {
  for (const [width, height] of [
    [1280, 720],
    [844, 390],
  ] as const) {
    test(`no zoom button, the view unchanged at ${width}x${height}, #1567`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(() => localStorage.setItem('ab-alone.board-zoom', 'on'));
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.getByRole('button', { name: 'Zoom the board' })).toBeHidden();
      await frame(page);
      const stored = await cells(page);
      await page.addInitScript(() => localStorage.setItem('ab-alone.board-zoom', 'off'));
      await page.reload();
      await page.locator('canvas').waitFor();
      await frame(page);
      expect(widest(await cells(page))).toEqual(widest(stored));
    });
  }
});
