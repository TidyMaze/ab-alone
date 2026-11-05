import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';

// Task #390: a legal target shows a ring with an arrow glyph that points the way its move goes (docs/specs/world.md
// section 6 rule 5, game-design.md section 2), readable at 3:1 on the deck. Direction codes: E 0, NE 2, NW 4.
const targets = (page: Page) => page.evaluate(() => (window as any).__targets());

const select = (page: Page, cells: [number, number][]) =>
  page.evaluate((list) => list.forEach(([q, r]) => (window as any).__click(q, r)), cells);

// Why the arrow's outline is what is measured (#1508): the arrow's pale cream fill sits at 1.3-1.6:1 on the deck, but the
// player reads the near-black edge round it. The arrow spans -0.2..0.26 of a cell (world units, spacing 1, board.ts
// axialTo3D, main.ts arrowShape) and the target ring starts at 0.34, so a disc of radius 0.3 cells holds the whole arrow
// and no ring. Its darkest tenth of pixels is the outline. The disc is laid on the cell's plane and projected through
// the camera (__cellToScreen takes fractional axial coordinates), so it stays round on the tilted board.
// Returns the mean colour of the deck box, and of the outline per target cell, read from one decode of the screenshot.
const OUTLINE_RADIUS = 0.3;
const outlines = (page: Page, png: Buffer, cells: [number, number][]) =>
  page.evaluate(
    async ([b64, list, radius]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const toScreen = (window as any).__cellToScreen as (q: number, r: number) => { x: number; y: number };
      const mean = (pts: { x: number; y: number }[]) => {
        const sum = [0, 0, 0];
        for (const p of pts) {
          const d = g.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
          for (let k = 0; k < 3; k++) sum[k]! += d[k]!;
        }
        return sum.map((s) => s / pts.length) as unknown as RGB;
      };
      // The deck: a small box on the cell's centre, as before.
      const c0 = toScreen(0, 0);
      const half = Math.max(1, Math.round((toScreen(1, 0).x - c0.x) * 0.05));
      const deckPts: { x: number; y: number }[] = [];
      for (let dx = -half; dx < half; dx++) for (let dy = -half; dy < half; dy++) deckPts.push({ x: Math.round(c0.x) + dx, y: Math.round(c0.y) + dy });
      const deck = mean(deckPts);
      // The disc on the cell's plane: world (x, z) maps to axial (q + dq, r + dr) with r = z / (sqrt3 / 2), q = x - r / 2.
      return list.map(([q, r]) => {
        const pts: { x: number; y: number; lum: number }[] = [];
        for (let x = -radius; x <= radius; x += 0.01)
          for (let z = -radius; z <= radius; z += 0.01) {
            if (x * x + z * z > radius * radius) continue;
            const dr = z / (Math.sqrt(3) / 2);
            const p = toScreen(q + (x - dr / 2), r + dr);
            const d = g.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
            pts.push({ x: p.x, y: p.y, lum: 0.2126 * d[0]! + 0.7152 * d[1]! + 0.0722 * d[2]! });
          }
        pts.sort((a, b) => a.lum - b.lum);
        return { outline: mean(pts.slice(0, Math.max(1, Math.round(pts.length * 0.1)))), deck };
      });
    },
    [png.toString('base64'), cells, OUTLINE_RADIUS] as const,
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
    // Wait for the draw that shows the selection (its arrows are built in that draw), not a fixed sleep: draws are
    // throttled under automation, so ask for one and read the counter until it moves past the click.
    const before = await page.evaluate(() => (window as any).__draws() as number);
    await expect
      .poll(() => page.evaluate(() => { (window as any).__drawNext(); return (window as any).__draws() as number; }), { timeout: 10_000 })
      .toBeGreaterThan(before);
    // Then shoot until a screenshot shows the arrows on the terrace (the kit loads async): the outline of each arrow, read
    // against the deck, must reach 3:1. The last reading's ratios go in the failure message.
    let ratios: number[] = [];
    await expect
      .poll(
        async () => {
          const png = await page.screenshot({ path: testInfo.outputPath(`targets-${width}.png`), type: 'png' });
          ratios = (await outlines(page, png, cells as [number, number][])).map(({ outline, deck }) => contrastRatio(outline, deck));
          return Math.min(...ratios);
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(3);
    expect(ratios.length, 'targets on the board').toBeGreaterThan(0);
    testInfo.annotations.push({ type: 'outline:deck', description: ratios.map((r) => r.toFixed(2)).join(', ') });
  });
}
