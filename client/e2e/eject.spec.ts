import { expect, test, type Page } from '@playwright/test';

// A 3v2 push on the q = -2 column that pushes a White marble off the board, 5 plies, the White
// plies are cooperative (?bot=off). Found by a search over the engine, replay it with the HUD.
async function open(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
}

// What the page saw the moment the effect started, before any frame could draw it: the kind of
// effect, the marble drawn 200 ms and 700 ms in, and, with `skip`, the effect right after a key or a
// click. Recorded in the page, so a slow runner can never miss the effect (#107).
// `turn`: the marble's quaternion on screen, as __marbleTurn reads it on the board (#364).
type Drawn = { along: number; across: number; roll: number; twist: number; drop: number; opacity: number; turn: number[] };
type Seen = {
  kind: string;
  blood?: string; // data-blood, the spatter of #278, set as the effect starts
  at0: Drawn[];
  at200: Drawn[];
  at700: Drawn[];
  afterSkip?: { ejecting?: string; blood?: string; marbles: number };
  spray?: Bloody[]; // the spatter in screen space at 0 to 850 ms, see the overlap checks (#278)
};

async function pushOffBoard(page: Page, skip?: 'key' | 'click') {
  const click = await open(page);
  await page.evaluate((skip) => {
    const w = window as any;
    w.__seen = null;
    const observer = new MutationObserver(() => {
      const kind = document.body.dataset.ejecting;
      if (!kind || w.__seen) return;
      const seen: Seen = {
        kind,
        blood: document.body.dataset.blood,
        at0: w.__ejectAt(0),
        at200: w.__ejectAt(200),
        at700: w.__ejectAt(700),
        spray: [0, 300, 450, 600, 850].map((ms) => ({ ms, ...w.__bloodAt(ms) })),
      };
      if (skip === 'key') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      if (skip === 'click') document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      if (skip) {
        seen.afterSkip = {
          ejecting: document.body.dataset.ejecting,
          blood: document.body.dataset.blood,
          marbles: w.__ejectAt(0).length,
        };
      }
      w.__seen = seen;
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true });
  }, skip);
  const hud = page.locator('#hud');
  await click([-2, 2], [-2, 3], [-2, 4], [-2, 1]); // 1. Black trio NW
  await expect(hud).toContainText('White to move');
  await click([0, -3], [0, -2], [-1, -2]); // 2. White pair SW
  await click([-2, 1], [-2, 2], [-2, 3], [-2, 0]); // 3. Black trio NW
  await click([-1, -2], [-1, -1], [-2, -2]); // 4. White pair W, into the Black column
  await expect(hud).toContainText('Black to move');
  await expect(page.locator('body')).not.toHaveAttribute('data-ejections', /.*/);
  // The marble to leave, at rest: the clicks of plies 3 and 4 may still wait for a slide.
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(4);
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', /.*/);
  const turn = (await page.evaluate(() => (window as any).__marbleTurn(-2, -2))) as number[];
  await click([-2, 0], [-2, 1], [-2, 2], [-2, -1]); // 5. 3v2 push, the last White marble leaves
  await expect(hud).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  await expect.poll(() => page.evaluate(() => (window as any).__seen)).not.toBeNull();
  return { click, turn, seen: (await page.evaluate(() => (window as any).__seen)) as Seen };
}

// Two unit quaternions give the same rotation when they are equal or opposite.
const sameRotation = (a: number[], b: number[]) =>
  expect(Math.abs(a.reduce((sum, x, i) => sum + x * b[i]!, 0))).toBeCloseTo(1, 4);

for (const reduced of [false, true]) {
  test(`an ejected marble starts its ${reduced ? 'fade' : 'tumble'} with the turn it had on the board, #364`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const { turn, seen } = await pushOffBoard(page);
    expect(seen.at0).toHaveLength(1);
    sameRotation(seen.at0[0]!.turn, turn);
  });
}

test('an ejected marble tumbles, stretches and fades into the void, then the effect ends', async ({ page }) => {
  const { seen } = await pushOffBoard(page);
  expect(seen.kind).toBe('tumble');
  expect(seen.blood).toBe('spatter'); // #278: the spatter starts with the tumble
  expect(seen.at200).toHaveLength(1);
  expect(seen.at200[0]!.opacity).toBe(1); // pushed over the rim, not fading yet
  const [past] = seen.at700;
  expect(past!.along).toBeGreaterThan(1); // stretched along the pull
  expect(past!.across).toBeLessThan(1);
  expect(Math.abs(past!.twist)).toBeGreaterThan(0); // tumbling
  expect(past!.drop).toBeGreaterThan(0); // falling into the void
  expect(past!.opacity).toBeGreaterThan(0);
  expect(past!.opacity).toBeLessThan(1);
  await expect(page.locator('body')).not.toHaveAttribute('data-ejecting', /.*/, { timeout: 3000 });
  await expect(page.locator('body')).not.toHaveAttribute('data-blood', /.*/, { timeout: 3000 }); // #278: it ends by itself
});

test('reduced motion: a plain fade, no tumble, no stretch, no spatter, the same outcome', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { seen } = await pushOffBoard(page);
  expect(seen.kind).toBe('fade');
  expect(seen.blood).toBeUndefined(); // #278: no particles under reduced motion
  const [mid] = seen.at200;
  expect(mid).toEqual({ along: 1, across: 1, roll: 0, twist: 0, drop: 0, opacity: mid!.opacity, turn: mid!.turn });
  expect(mid!.opacity).toBeGreaterThan(0);
  expect(mid!.opacity).toBeLessThan(1);
  await expect(page.locator('body')).not.toHaveAttribute('data-ejecting', /.*/, { timeout: 3000 });
  await expect(page.locator('#hud')).toContainText('White to move');
});

// #379: the Reduced motion toggle of the settings menu follows the system setting until pressed, then keeps the
// player's choice, saved locally: it survives a reload (pushOffBoard opens the page again).
async function pressReducedMotion(page: Page, before: boolean) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.getByRole('button', { name: 'Settings' }).click();
  const toggle = page.getByRole('button', { name: 'Reduced motion' });
  await expect(toggle).toHaveAttribute('aria-pressed', String(before));
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(!before));
}

test('the Reduced motion setting: a plain fade while the system allows motion, kept after a reload', async ({ page }) => {
  await pressReducedMotion(page, false);
  const { seen } = await pushOffBoard(page);
  expect(seen.kind).toBe('fade');
  expect(seen.blood).toBeUndefined();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Reduced motion' })).toHaveAttribute('aria-pressed', 'true');
});

test('the Reduced motion setting: on by default under the system setting, a press brings the tumble back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pressReducedMotion(page, true);
  const { seen } = await pushOffBoard(page);
  expect(seen.kind).toBe('tumble');
  expect(seen.blood).toBe('spatter');
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', /.*/);
});

// #278: the spatter, in screen space, never covers a cell, a marble on the board or the steel frame, and stays on
// screen. Checked on a desktop and a phone, at the start, the peak (450 ms) and before it ends.
type Box = { x0: number; y0: number; x1: number; y1: number };
type Pt = { x: number; y: number };
type Bloody = { ms: number; spray: Box | null; drops: number; cells: Box[]; marbles: Box[]; frame: Pt[] };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// A box and a convex polygon are apart when one axis separates them: a box axis, or an edge normal of the polygon.
function hitsPolygon(box: Box, poly: Pt[]): boolean {
  const corners = [box.x0, box.x1].flatMap((x) => [box.y0, box.y1].map((y) => ({ x, y })));
  const normals = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return { x: p.y - q.y, y: q.x - p.x };
  });
  const span = (pts: Pt[], axis: Pt) => {
    const v = pts.map((p) => p.x * axis.x + p.y * axis.y);
    return [Math.min(...v), Math.max(...v)];
  };
  return [...normals, { x: 1, y: 0 }, { x: 0, y: 1 }].every((axis) => {
    const [b0, b1] = span(corners, axis);
    const [p0, p1] = span(poly, axis);
    return b0 < p1 && p0 < b1;
  });
}

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['phone', { width: 375, height: 812 }],
] as const) {
  test.describe(`the spatter on a ${name}`, () => {
    test.use({ viewport });
    test('clears every cell, marble and the steel frame, and stays on screen', async ({ page }) => {
      const { seen } = await pushOffBoard(page);
      expect(seen.spray).toHaveLength(5);
      for (const s of seen.spray!) {
        expect(s.spray, `spatter at ${s.ms} ms`).not.toBeNull();
        const box = s.spray!;
        console.log(`${name}, ${s.ms} ms: spatter ${Math.round(box.x1 - box.x0)} x ${Math.round(box.y1 - box.y0)} px, ${s.drops} drops`);
        expect(s.cells.some((c) => overlaps(box, c)), `a cell at ${s.ms} ms`).toBe(false);
        expect(s.marbles.some((m) => overlaps(box, m)), `a marble at ${s.ms} ms`).toBe(false);
        expect(hitsPolygon(box, s.frame), `the frame at ${s.ms} ms`).toBe(false);
        expect(box.x0 >= 0 && box.y0 >= 0 && box.x1 <= viewport.width && box.y1 <= viewport.height, `on screen at ${s.ms} ms`).toBe(true);
      }
    });
  });
}

for (const input of ['key', 'click'] as const) {
  test(`a ${input} during the effect ends it at once and never holds the next move`, async ({ page }) => {
    const { click, seen } = await pushOffBoard(page, input);
    expect(seen.kind).toBe('tumble');
    expect(seen.afterSkip).toEqual({ marbles: 0 }); // no data-ejecting left, no marble in the void
    expect(seen.afterSkip?.blood).toBeUndefined(); // #278: the spatter ends at once too
    await click([1, -2], [1, -1]); // White plays at once: one marble SE
    await expect(page.locator('#hud')).toContainText('Black to move');
    await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  });
}
