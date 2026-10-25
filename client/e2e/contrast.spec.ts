import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';

// Bug #339: a cell's edge must stay 3:1 against the surface next to it (docs/specs/world.md section 5, art.md section 1).
// The start position, 1280x720. Around each listed cell, 8 points on its bevel ring (radius 0.44, 45 degrees apart),
// each against the surface 0.52 further out along the same direction. A cell passes when at least 6 of the 8 points
// reach 3:1: a seam point where the neighbouring cell occludes the bevel may fail. The empty rim cells of the far half
// too, at the high tier with Clear board off: the fog stays off the cells (bug #399). The far row holds marbles, which
// hide its bevels, so fog.spec.ts checks that row.
const CELLS: [number, number][] = [[0, 0], [-2, 1], [2, -1], [1, 1], [-2, -2], [4, -2]];
const EDGE = 0.44;
const SURFACE = 0.52;
const MIN_PASSING = 6;
const SQRT3_2 = Math.sqrt(3) / 2;

// World offset (x, z) from a cell centre, in axial units: axialTo3D maps q to x = q + r / 2 and r to z = (sqrt 3 / 2) r.
const axialOffset = (dx: number, dz: number) => {
  const dr = dz / SQRT3_2;
  return { dq: dx - dr / 2, dr };
};

// One decode of the screenshot for all the samples: a decode per sample took most of the test's time (#349).
const pixels = (page: Page, png: Buffer, points: [number, number][]) =>
  page.evaluate(
    async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const [r, gr, b] = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [r, gr, b] as RGB;
      });
    },
    [png.toString('base64'), points] as const,
  );

test('each cell edge is 3:1 against the surface next to it on at least 6 of 8 ring points, bug #339', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('ab-alone.quality', 'high');
    localStorage.setItem('ab-alone.clear-board', 'off');
  });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'high');
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'off');
  await page.mouse.move(2, 2); // no hover ghost
  // Under automation the page skips draws (#216): wait for a draw that began after the mouse moved (#365).
  const drawn = await page.evaluate(() => (window as any).__draws() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, drawn);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const png = await page.screenshot({ path: testInfo.outputPath('cells.png'), type: 'png' });
  // Per cell and ring point, the edge then the surface: two axial cells, mapped to the screen in one call.
  const axial: [number, number][] = [];
  for (const [q, r] of CELLS) {
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4;
      const edgeOff = axialOffset(EDGE * Math.cos(angle), EDGE * Math.sin(angle));
      const surfOff = axialOffset(SURFACE * Math.cos(angle), SURFACE * Math.sin(angle));
      axial.push([q + edgeOff.dq, r + edgeOff.dr], [q + surfOff.dq, r + surfOff.dr]);
    }
  }
  const screen = await page.evaluate(
    (list) => list.map(([cq, cr]) => (window as any).__cellToScreen(cq, cr) as { x: number; y: number }),
    axial,
  );
  const colors = await pixels(page, png, screen.map(({ x, y }) => [x, y]));
  const failures: string[] = [];
  CELLS.forEach(([q, r], cell) => {
    const ratios: number[] = [];
    for (let k = 0; k < 8; k++) {
      const i = (cell * 8 + k) * 2;
      ratios.push(contrastRatio(colors[i]!, colors[i + 1]!));
    }
    const passing = ratios.filter((ratio) => ratio >= 3).length;
    const line = `ring (${q},${r}): ${passing}/8 pass, ratios ${ratios.map((ratio) => ratio.toFixed(2)).join(' ')}`;
    console.log(line);
    if (passing < MIN_PASSING) failures.push(line);
  });
  expect(failures, 'cells below 6 of 8 ring points at 3:1').toEqual([]);
});

// Task #344: both marbles stand out from the deck at 3:1 (world.md section 5, art.md section 1). The start position,
// hot-seat: the shell plays the near rows, the glass the far ones. A marble is the mean colour of a small box where its
// cell's centre is drawn, seen through the lower body of the marble (under the glass's core); the deck is the mean of
// the same box on five empty cells in the middle. The box follows the cell spacing, so it holds on desktop and phone.
const SHELL_CELLS: [number, number][] = [[-4, 4], [-2, 4], [0, 4], [-1, 3], [0, 2]];
const GLASS_CELLS: [number, number][] = [[4, -4], [2, -4], [0, -4], [1, -3], [0, -2]];
const DECK_CELLS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

const boxMeans = (page: Page, png: Buffer, cells: [number, number][]) =>
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
      const half = Math.max(2, Math.round((toScreen(1, 0).x - toScreen(0, 0).x) * 0.08));
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

for (const [name, width, height] of [['desktop', 1280, 720], ['phone', 375, 812]] as const) {
  test(`each marble reads 3:1 against the deck on ${name}, task #344`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await page.mouse.move(2, 2); // no hover ghost
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const png = await page.screenshot({ path: testInfo.outputPath(`marbles-${name}.png`), type: 'png' });
    const deck = await boxMeans(page, png, DECK_CELLS);
    const mean = [0, 1, 2].map((k) => deck.reduce((s, c) => s + c[k]!, 0) / deck.length) as unknown as RGB;
    const failures: string[] = [];
    for (const [side, cells] of [['shell', SHELL_CELLS], ['glass', GLASS_CELLS]] as const) {
      const ratios = (await boxMeans(page, png, cells)).map((rgb) => contrastRatio(rgb, mean));
      const line = `${side} on ${name}: ratios ${ratios.map((ratio) => ratio.toFixed(2)).join(' ')}`;
      console.log(line);
      if (ratios.some((ratio) => ratio < 3)) failures.push(line);
    }
    expect(failures, 'marbles below 3:1 against the deck').toEqual([]);
  });
}

// Task #377: every dark shell skin reads 3:1 against the deck (asserted) and its ratio against the void is logged: the void
// (the near-black backdrop, a pixel at the left edge of the window) is out of reach for any dark shell, the default Scarab
// ridges included (1.0 to 1.1), so it is reported in the PR, not asserted. The skin comes from the stored setting; the deck
// and the marbles are measured as for #344.
const SKIN_IDS = ['scarab', 'obsidian', 'slag', 'hex', 'ash', 'riveted', 'tar', 'ember', 'copper', 'void'];
for (const id of SKIN_IDS) {
  test(`the ${id} shell reads 3:1 against the deck, task #377`, async ({ page }, testInfo) => {
    await page.addInitScript((skin) => localStorage.setItem('ab-alone.shell-skin', skin), id);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await page.mouse.move(2, 2); // no hover ghost
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const png = await page.screenshot({ path: testInfo.outputPath(`skin-${id}.png`), type: 'png' });
    const mean = (colors: RGB[]) => [0, 1, 2].map((k) => colors.reduce((s, c) => s + c[k]!, 0) / colors.length) as unknown as RGB;
    const deck = mean(await boxMeans(page, png, DECK_CELLS));
    const [voidColor] = await pixels(page, png, [[20, 360]]);
    const ratios = (await boxMeans(page, png, SHELL_CELLS)).map((rgb) => [contrastRatio(rgb, deck), contrastRatio(rgb, voidColor!)]);
    const line = `${id}: deck ${ratios.map((r) => r[0]!.toFixed(2)).join(' ')}, void ${ratios.map((r) => r[1]!.toFixed(2)).join(' ')}`;
    console.log(line);
    expect(ratios.map((r) => r[0]!).filter((ratio) => ratio < 3), line).toEqual([]);
  });
}

// Task #377: every pale glass skin reads 3:1 against the deck, the glass cells of the start position (hot-seat, the
// glass on the far rows) as for #344. The skin comes from the stored setting.
const GLASS_IDS = ['smoked', 'frost', 'pearl', 'bone', 'moon', 'kintsugi', 'lantern', 'prism', 'nebula', 'visor'];
for (const id of GLASS_IDS) {
  test(`the ${id} glass reads 3:1 against the deck, task #377`, async ({ page }, testInfo) => {
    await page.addInitScript((skin) => localStorage.setItem('ab-alone.glass-skin', skin), id);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await page.mouse.move(2, 2); // no hover ghost
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const png = await page.screenshot({ path: testInfo.outputPath(`glass-${id}.png`), type: 'png' });
    const mean = (colors: RGB[]) => [0, 1, 2].map((k) => colors.reduce((s, c) => s + c[k]!, 0) / colors.length) as unknown as RGB;
    const deck = mean(await boxMeans(page, png, DECK_CELLS));
    const ratios = (await boxMeans(page, png, GLASS_CELLS)).map((rgb) => contrastRatio(rgb, deck));
    const line = `${id}: glass ${ratios.map((r) => r.toFixed(2)).join(' ')}`;
    console.log(line);
    expect(ratios.filter((ratio) => ratio < 3), line).toEqual([]);
  });
}
