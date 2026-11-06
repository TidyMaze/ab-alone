import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// The links of the rogue-lite map keep clear of the labels (#1543) and the plate opens on the act of the node to pick, its header whole
// (#1569, docs/specs/roguelite.md section 2). Seed 7 on the paced map (`map: 1`), the rune of the shortcut owned so a shortcut is drawn too.
const load = async (page: Page, path: number[]) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), { seed: 7, army: 14, path, fighting: false, moves: [], end: '', map: 1, runes: 2 });
  await expect(page.locator('#run-map')).toBeVisible();
};

test('no link of the map crosses a label: a name, the note under it or an act header, #1543', async ({ page }, testInfo) => {
  await load(page, []);
  const crossings = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#run-map .run-graph > svg')!;
    const ctm = svg.getScreenCTM()!;
    const labels = [...document.querySelectorAll('#run-map .run-graph button.node span, #run-map .run-graph button.node small, #run-map .act-head')].map((e) => e.getBoundingClientRect());
    const found: string[] = [];
    for (const l of svg.querySelectorAll('line, polyline')) {
      const points = (l.tagName === 'line' ? [[+l.getAttribute('x1')!, +l.getAttribute('y1')!], [+l.getAttribute('x2')!, +l.getAttribute('y2')!]] : l.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number))).map(([x, y]) => new DOMPoint(x, y).matrixTransform(ctm));
      for (let k = 1; k < points.length; k++)
        for (let t = 0; t <= 40; t++) {
          const [x, y] = [points[k - 1]!.x + ((points[k]!.x - points[k - 1]!.x) * t) / 40, points[k - 1]!.y + ((points[k]!.y - points[k - 1]!.y) * t) / 40];
          if (labels.some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1)) found.push(`${l.getAttribute('class') ?? 'link'} at ${Math.round(x)},${Math.round(y)}`);
        }
    }
    return { found, links: svg.querySelectorAll('line, polyline').length, labels: labels.length };
  });
  expect(crossings.links).toBeGreaterThan(20);
  expect(crossings.labels).toBeGreaterThan(10);
  expect(crossings.found).toEqual([]);
  await shot(page, { path: testInfo.outputPath('roguelite-map-links.png') });
});

test.describe('a phone 390 by 844 held upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('the map opens on the header of the act of the node to pick, whole, and the node in view, #1569', async ({ page }, testInfo) => {
    // The path through the first act by its first open node each time, then the boss: a map in the middle of an act, the act 2 header below.
    await load(page, []);
    const path: number[] = [];
    for (let k = 0; k < 3; k++) {
      path.push(await page.evaluate(() => +document.querySelector<HTMLElement>('#run-map button.node:not([disabled])')!.dataset.node!));
      await page.evaluate((s) => (window as any).__run(s), { seed: 7, army: 14, path, fighting: false, moves: [], end: '', map: 1, runes: 2 });
    }
    const view = () =>
      page.evaluate(() => {
        const plate = document.getElementById('run-map')!.getBoundingClientRect();
        const rect = (e: Element) => e.getBoundingClientRect();
        const node = rect(document.querySelector('#run-map button.node:not([disabled])')!);
        const heads = [...document.querySelectorAll('#run-map .act-head')].map(rect).filter((h) => h.bottom > plate.top);
        return { plate: [plate.top, plate.bottom], head: [heads[0]!.top, heads[0]!.bottom], node: [node.top, node.bottom] };
      });
    const { plate, head, node } = await view();
    expect(head[0]!).toBeGreaterThanOrEqual(plate[0]! + 1); // the header of the act is whole under the plate's top edge
    expect(head[0]! - plate[0]!).toBeLessThan(20); // and it is the one at the top
    expect(node[0]!).toBeGreaterThanOrEqual(plate[0]!);
    expect(node[1]!).toBeLessThanOrEqual(plate[1]!); // the node to pick is in view
    await shot(page, { path: testInfo.outputPath('roguelite-map-phone.png') });
  });
});
