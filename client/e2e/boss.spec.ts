import { expect, test, type Page } from '@playwright/test';

// Bug #326: a tell drawn on top of a boss marble (a Choir army glyph, The Chaplain's converted cap) reads 3:1 against
// the shell it sits on (world.md section 5, Tell marks). For each cell, the contrast (WCAG 2) of the brightest to the
// darkest pixel of a small box where the top of its marble is drawn, read from one screenshot. The box follows the
// cell spacing, so it holds at any window size.
const topContrasts = async (page: Page, cells: [number, number][]): Promise<number[]> => {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([b64, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [img.width, img.height];
      const g = canvas.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return list.map(([q, r]) => {
        const toScreen = (window as any).__cellToScreen;
        const c = toScreen(q, r);
        const step = toScreen(q + 1, r).x - c.x; // one cell to the right, same row
        const half = Math.round(step * 0.12);
        const d = g.getImageData(Math.round(c.x) - half, Math.round(c.y - step * 0.55) - half, 2 * half, 2 * half).data;
        const lum: number[] = [];
        for (let i = 0; i < d.length; i += 4) {
          lum.push(0.2126 * linear(d[i]!) + 0.7152 * linear(d[i + 1]!) + 0.0722 * linear(d[i + 2]!));
        }
        return (Math.max(...lum) + 0.05) / (Math.min(...lum) + 0.05);
      });
    },
    [png, cells] as const,
  );
};

test('start The Echo, play a move, the boss replies, Retry resets the board', async ({ page }) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(hud).toContainText('The Echo');
  await expect(hud).toContainText('P1');
  await expect(hud).toContainText('White to move');
  await expect(page.locator('#hud .notch.active')).toHaveText('P1');

  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  // The boss answers in the worker: two plies, the HUD is back on the human side.
  await expect.poll(plies, { timeout: 30_000 }).toBe(2);
  await expect(hud).toContainText('White to move');
  await expect(hud).toContainText('The Echo');
  await page.screenshot({ path: 'test-results/boss-hud.png', clip: { x: 0, y: 0, width: 420, height: 260 } });

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(plies).toBe(0);
  await expect(hud).toContainText('White to move');
  await expect(hud).toContainText('The Echo');
  await expect(hud).toContainText('White ejected 0/6');
});

// Bug #144: main.ts awaits the wasm engine, the renderer and the textures before it attaches the
// Boss fight listener. A click right after domcontentloaded must either hit a disabled button or open the list.
test('Boss fight is disabled or works when clicked right after load, bug #144', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const atClick = await page.evaluate(() => {
    const button = document.getElementById('boss-fight') as HTMLButtonElement;
    const disabled = button.disabled;
    button.click();
    return { disabled, open: !document.getElementById('boss-list')!.hidden };
  });
  expect(atClick.disabled || atClick.open).toBe(true);
  await expect(page.locator('#boss-fight')).toBeEnabled(); // and it works once the page is ready
});

// The Hull (#149): a rim cell cracks at ply 8, shows its ticks for 2 plies, then it is a hole.
test('start The Hull, play to the first wave: a cracked cell ticks down, then vanishes, #149', async ({ page }, testInfo) => {
  test.slow(); // five boss searches in the worker, then a sixth ply
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  // A forward one-marble move (NW or NE): Black never steps back, so no position repeats.
  const advance = async () => {
    const mv = await page.evaluate(() =>
      (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
    );
    const [q, r] = mv.cells[0];
    await click(q, r);
    await click(mv.dir === 4 ? q : q + 1, r - 1);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Hull' }).click();
  await expect(hud).toContainText('The Hull');
  await expect(body).toHaveAttribute('data-cracks', '0');
  for (let n = 1; n <= 4; n++) {
    await advance();
    await expect.poll(plies, { timeout: 30_000 }).toBe(2 * n); // the boss replied
  }
  await expect(body).toHaveAttribute('data-cracks', '1');
  await expect(hud).toContainText('Rim cracks: 1 cell in 2 plies');
  await page.screenshot({ path: testInfo.outputPath('hull-cracked.png') });

  await advance();
  await expect.poll(plies, { timeout: 30_000 }).toBe(10);
  await expect(body).toHaveAttribute('data-vanished', '1');
  await expect(body).toHaveAttribute('data-cracks', '0');
  await expect(hud).not.toContainText('Rim cracks');
  await page.screenshot({ path: testInfo.outputPath('hull-vanished.png') });
});

// The Chaplain (#150, Decision #154): a hovered move shows the marbles it would expose to a flip at
// the end of the boss turn, and a converted marble keeps its own look.
test('start The Chaplain: a hovered move shows the marbles it exposes, a converted marble keeps its look, #150', async ({
  page,
}, testInfo) => {
  test.slow(); // up to 20 boss searches in the worker
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const screen = (q: number, r: number) =>
    page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]) as Promise<{ x: number; y: number }>;
  const click = async (q: number, r: number) => {
    const p = await screen(q, r);
    await page.mouse.click(p.x, p.y);
  };
  const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
  const legal = (pick: 'forward' | 'exposing') =>
    page.evaluate((how) => {
      const w = window as any;
      return w.__legal().find((m: any) =>
        m.cells.length === 1 && (how === 'forward' ? m.dir === 4 || m.dir === 2 : w.__preview(m).length > 0),
      ) ?? null;
    }, pick);

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Chaplain' }).click();
  await expect(hud).toContainText('The Chaplain');
  await expect(body).toHaveAttribute('data-converted', '0');

  let previewed = false;
  let converted = false;
  for (let n = 1; n <= 20 && !(previewed && converted); n++) {
    const exposing = previewed ? null : await legal('exposing');
    if (exposing) {
      const [q, r] = exposing.cells[0];
      const [dq, dr] = DIRS[exposing.dir]!;
      await click(q, r); // select the marble
      const t = await screen(q + dq!, r + dr!);
      await page.mouse.move(t.x, t.y); // hover the move: ghost and flip preview
      await expect(body).not.toHaveAttribute('data-flips', '0');
      await expect(hud).toContainText('Flips next boss turn');
      await page.screenshot({ path: testInfo.outputPath('chaplain-preview.png') });
      await click(q, r); // deselect
      previewed = true;
    }
    const mv = await legal('forward');
    const [q, r] = mv.cells[0];
    await click(q, r);
    await click(mv.dir === 4 ? q : q + 1, r - 1);
    await expect.poll(plies, { timeout: 30_000 }).toBe(2 * n); // the boss replied
    if (!converted && (await body.getAttribute('data-converted')) !== '0') {
      await expect(hud).toContainText('Converted:');
      await page.screenshot({ path: testInfo.outputPath('chaplain-converted.png') });
      const cells = await page.evaluate(() => (window as any).__converted());
      for (const c of await topContrasts(page, cells)) expect(c).toBeGreaterThanOrEqual(3); // its cap reads (#326)
      converted = true;
    }
  }
  expect(previewed).toBe(true);
  expect(converted).toBe(true);
});

// Bug #299: a boss turn whose flip costs the boss a marble lost to the void (#207), while its move pushes nothing
// off, threw in afterPlay and skipped the board refresh. Seed 1 and the forward moves reach it on the 18th boss turn.
test('The Chaplain: a boss marble lost for a flip counts for the player and the board is drawn after it, bug #299', async ({
  page,
}) => {
  test.slow(); // 18 boss searches in the worker
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(1)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Chaplain' }).click();
  await expect(hud).toContainText('The Chaplain');
  expect(await page.evaluate(() => (window as any).__fight().seed)).toBe(1);
  for (let n = 1; n <= 18; n++) {
    const mv = await page.evaluate(() =>
      (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
    );
    const [q, r] = mv.cells[0];
    await click(q, r);
    await click(mv.dir === 4 ? q : q + 1, r - 1);
    await expect.poll(plies, { timeout: 30_000 }).toBe(2 * n); // the boss replied
  }
  await expect(hud).toContainText('White ejected 1/6'); // the lost boss marble, drawn without a click
  expect(errors).toEqual([]);
});

// The Choir (#183): a radius 3 board, a glyph per army on the boss marbles, only the army in turn
// moves and the next one wears a ring.
test('start The Choir: the boss moves the army in turn, the next army is marked, #183', async ({ page }, testInfo) => {
  test.slow(); // a boss search in the worker
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  type Member = { cell: [number, number]; army: number };
  const armies = () => page.evaluate(() => (window as any).__armies()) as Promise<Member[]>;
  const cellsOf = (list: Member[], army: number) =>
    list.filter((m) => m.army === army).map((m) => m.cell.join(',')).sort();
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Choir' }).click();
  await expect(hud).toContainText('The Choir');
  await expect(hud).toContainText('White ejected 0/10 · Black ejected 0/6');
  await expect(hud).toContainText('Next army: Alto');
  await expect(page.locator('#hud .notch')).toHaveCount(3);
  await expect(body).toHaveAttribute('data-vanished', '24'); // the outer ring is a hole
  await expect(body).toHaveAttribute('data-armies', '12');
  await expect(body).toHaveAttribute('data-next-army', 'Alto');
  await page.screenshot({ path: testInfo.outputPath('choir-start.png') });

  const before = await armies();
  for (const c of await topContrasts(page, before.map((m) => m.cell))) expect(c).toBeGreaterThanOrEqual(3); // #326
  const mv = await page.evaluate(() =>
    (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
  );
  const [q, r] = mv.cells[0];
  await click(q, r);
  await click(mv.dir === 4 ? q : q + 1, r - 1);
  await expect.poll(plies, { timeout: 30_000 }).toBe(2); // the boss replied
  const after = await armies();
  expect(cellsOf(after, 0)).not.toEqual(cellsOf(before, 0)); // Alto, the army in turn, moved
  expect(cellsOf(after, 1)).toEqual(cellsOf(before, 1));
  expect(cellsOf(after, 2)).toEqual(cellsOf(before, 2));
  await expect(hud).toContainText('Next army: Tenor');
  await expect(body).toHaveAttribute('data-next-army', 'Tenor');
  await page.screenshot({ path: testInfo.outputPath('choir-tenor-next.png') });
});
