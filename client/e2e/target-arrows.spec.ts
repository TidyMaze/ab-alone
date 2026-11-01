import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';

// Task #390: a legal target shows a ring with an arrow glyph that points the way its move goes (docs/specs/world.md
// section 6 rule 5, game-design.md section 2), readable at 3:1 on the deck. Direction codes: E 0, NE 2, NW 4.
const targets = (page: Page) => page.evaluate(() => (window as any).__targets());

const select = (page: Page, cells: [number, number][]) =>
  page.evaluate((list) => list.forEach(([q, r]) => (window as any).__click(q, r)), cells);

// The mean colour of a small box on each cell's centre, where the arrow is drawn, in one decode of the screenshot.
const centres = (page: Page, png: Buffer, cells: [number, number][]) =>
  page.evaluate(
    async ([b64, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const toScreen = (window as any).__cellToScreen;
      const half = Math.max(1, Math.round((toScreen(1, 0).x - toScreen(0, 0).x) * 0.05));
      return list.map(([q, r]) => {
        const p = toScreen(q, r);
        const d = g.getImageData(Math.round(p.x) - half, Math.round(p.y) - half, 2 * half, 2 * half).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
        return sum.map((s) => s / (d.length / 4)) as unknown as RGB;
      });
    },
    [png.toString('base64'), cells] as const,
  );

test('the targets of a selected group carry the direction of the move a click plays, task #390', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect(await targets(page)).toEqual([]);

  await select(page, [[0, 2]]); // one marble: E, NE and NW are free
  expect(await targets(page)).toEqual([
    { cell: [1, 2], dir: 0 },
    { cell: [1, 1], dir: 2 },
    { cell: [0, 1], dir: 4 },
  ]);

  await select(page, [[0, 3]]); // a pair on the NW line: broadside NE, inline NW
  expect(await targets(page)).toEqual([
    { cell: [1, 2], dir: 2 },
    { cell: [1, 1], dir: 2 },
    { cell: [0, 1], dir: 4 },
  ]);
});

const VIEWS = [
  ['desktop', 1280, 720, false],
  ['phone', 375, 812, false],
  ['desktop with Clear board', 1280, 720, true],
] as const;
for (const [name, width, height, clear] of VIEWS) {
  test(`each target arrow reads 3:1 against the deck on ${name}, task #390`, { tag: '@contrast' }, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    if (clear) await page.addInitScript(() => localStorage.setItem('ab-alone.clear-board', 'on'));
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await expect(page.locator('body')).toHaveAttribute('data-clear', clear ? 'on' : 'off');
    await page.mouse.move(2, 2); // no hover ghost
    await select(page, [[0, 2]]);
    const cells = (await targets(page)).map((t: { cell: [number, number] }) => t.cell);
    // Draws are throttled under automation: shoot until one shows the selection.
    await expect
      .poll(
        async () => {
          const png = await page.screenshot({ path: testInfo.outputPath(`targets-${width}.png`), type: 'png' });
          const [deck, ...arrows] = await centres(page, png, [[0, 0], ...cells]);
          return Math.min(...arrows.map((rgb) => contrastRatio(rgb, deck!)));
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(3);
  });
}
