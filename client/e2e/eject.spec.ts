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
type Drawn = { along: number; across: number; roll: number; twist: number; drop: number; opacity: number };
type Seen = {
  kind: string;
  blood?: string; // data-blood, the spatter of #278, set as the effect starts
  at200: Drawn[];
  at700: Drawn[];
  afterSkip?: { ejecting?: string; blood?: string; marbles: number };
};

async function pushOffBoard(page: Page, skip?: 'key' | 'click') {
  const click = await open(page);
  await page.evaluate((skip) => {
    const w = window as any;
    w.__seen = null;
    const observer = new MutationObserver(() => {
      const kind = document.body.dataset.ejecting;
      if (!kind || w.__seen) return;
      const seen: Seen = { kind, blood: document.body.dataset.blood, at200: w.__ejectAt(200), at700: w.__ejectAt(700) };
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
  await click([-2, 0], [-2, 1], [-2, 2], [-2, -1]); // 5. 3v2 push, the last White marble leaves
  await expect(hud).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  await expect.poll(() => page.evaluate(() => (window as any).__seen)).not.toBeNull();
  return { click, seen: (await page.evaluate(() => (window as any).__seen)) as Seen };
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
  expect(mid).toEqual({ along: 1, across: 1, roll: 0, twist: 0, drop: 0, opacity: mid!.opacity });
  expect(mid!.opacity).toBeGreaterThan(0);
  expect(mid!.opacity).toBeLessThan(1);
  await expect(page.locator('body')).not.toHaveAttribute('data-ejecting', /.*/, { timeout: 3000 });
  await expect(page.locator('#hud')).toContainText('White to move');
});

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
