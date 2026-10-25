import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';

// Bug #339: a cell's edge must stay 3:1 against the surface next to it (docs/specs/world.md section 5, art.md section 1).
// The start position, 1280x720. Around each listed cell, 8 points on its bevel ring (radius 0.44, 45 degrees apart),
// each against the surface 0.52 further out along the same direction. A cell passes when at least 6 of the 8 points
// reach 3:1: a seam point where the neighbouring cell occludes the bevel may fail.
const CELLS: [number, number][] = [[0, 0], [-2, 1], [2, -1], [1, 1]];
const EDGE = 0.44;
const SURFACE = 0.52;
const MIN_PASSING = 6;
const SQRT3_2 = Math.sqrt(3) / 2;

// World offset (x, z) from a cell centre, in axial units: axialTo3D maps q to x = q + r / 2 and r to z = (sqrt 3 / 2) r.
const axialOffset = (dx: number, dz: number) => {
  const dr = dz / SQRT3_2;
  return { dq: dx - dr / 2, dr };
};

const pixel = (page: Page, png: Buffer, x: number, y: number) =>
  page.evaluate(
    async ([b64, px, py]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const [r, gr, b] = g.getImageData(Math.round(px as number), Math.round(py as number), 1, 1).data;
      return [r, gr, b] as RGB;
    },
    [png.toString('base64'), x, y] as const,
  );

test('each cell edge is 3:1 against the surface next to it on at least 6 of 8 ring points, bug #339', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.mouse.move(2, 2); // no hover ghost
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const png = await page.screenshot({ path: testInfo.outputPath('cells.png'), type: 'png' });
  const at = (q: number, r: number) =>
    page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr) as { x: number; y: number }, [q, r]);
  const failures: string[] = [];
  for (const [q, r] of CELLS) {
    const ratios: number[] = [];
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4;
      const edgeOff = axialOffset(EDGE * Math.cos(angle), EDGE * Math.sin(angle));
      const surfOff = axialOffset(SURFACE * Math.cos(angle), SURFACE * Math.sin(angle));
      const edge = await at(q + edgeOff.dq, r + edgeOff.dr);
      const surface = await at(q + surfOff.dq, r + surfOff.dr);
      ratios.push(contrastRatio(await pixel(page, png, edge.x, edge.y), await pixel(page, png, surface.x, surface.y)));
    }
    const passing = ratios.filter((ratio) => ratio >= 3).length;
    const line = `ring (${q},${r}): ${passing}/8 pass, ratios ${ratios.map((ratio) => ratio.toFixed(2)).join(' ')}`;
    console.log(line);
    if (passing < MIN_PASSING) failures.push(line);
  }
  expect(failures, 'cells below 6 of 8 ring points at 3:1').toEqual([]);
});
