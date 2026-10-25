import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';
import { openModes } from './modes';

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

// Bug #326: a tell drawn on top of a boss marble (a Choir army glyph, The Chaplain's converted cap) reads 3:1 against
// the shell it sits on (world.md section 5, Tell marks). For each cell, the contrast (WCAG 2) of the brightest to the
// darkest pixel of a small box where the top of its marble is drawn, read from one screenshot. The box follows the
// cell spacing, so it holds at any window size.
// `path` keeps the screenshot read, for the report (#429).
const topContrasts = async (page: Page, cells: [number, number][], path?: string): Promise<number[]> => {
  // A frame drawn after this call sees the marks the caller just waited for (#383): two rAF can miss it.
  await freshDraw(page);
  const png = (await page.screenshot({ path })).toString('base64');
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

// #358: every boss tell has a sound twin, played when the tell appears or changes. window.__tellCues() lists the cues
// played so far. The clicks that open the fight are the gesture that starts the audio.
const tellCues = (page: Page) => page.evaluate(() => (window as any).__tellCues()) as Promise<string[]>;

// #355: The Hull's crack decal reads 3:1 on its cell (world.md section 5, Tell marks). Two screenshots, the decal shown
// then hidden: at each texel of crack-decal.png inside a crack line, in the ring round the marble, the contrast (WCAG 2)
// of the drawn crack against the steel under it. A point whose pixel does not change is hidden (by a shell, a tick, the
// bevel) and left out. The page draws at half the pixel ratio under automation, so most crack pixels are mixed with
// the steel: the check counts the points where the crack is fully drawn and reads 3:1. Returns how many points show
// and how many of them reach 3:1. `path` keeps the screenshot with the decal shown, for the report (#431).
const crackContrast = async (
  page: Page,
  [q, r]: [number, number],
  path?: string,
): Promise<{ shown: number; reading: number }> => {
  await page.mouse.move(2, 2); // no hover ghost
  await freshDraw(page); // a draw since the last change
  const shown = await page.screenshot({ path });
  await page.evaluate(() => (window as any).__crackDecalShown(false));
  let hidden = shown;
  for (let n = 0; n < 50 && hidden.equals(shown); n++) {
    await freshDraw(page);
    hidden = await page.screenshot();
  }
  const pairs: [RGB, RGB][] = await page.evaluate(
    async ([a, b, cq, cr]) => {
      (window as any).__crackDecalShown(true); // shown again, in the same call to the page (#431)
      const pixels = async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = [img.width, img.height];
        const g = canvas.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const { data } = g.getImageData(0, 0, img.width, img.height);
        const at = (x: number, y: number) => {
          const i = (y * img.width + x) * 4;
          return [data[i]!, data[i + 1]!, data[i + 2]!];
        };
        return { w: img.width, at };
      };
      const [shownPx, hiddenPx] = await Promise.all([a, b].map((png) => pixels(`data:image/png;base64,${png}`)));
      const decal = await pixels('assets/crack-decal.png');
      const size = decal.w, CELL = 0.46; // the decal covers the disc, image x and y along the world x and z
      const line = (x: number, y: number) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (decal.at(x + dx, y + dy)[0]! < 250) return false;
        return true;
      };
      const out: number[][][] = [];
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if (!line(x, y)) continue;
          const wx = ((2 * (x + 0.5)) / size - 1) * CELL, wz = ((2 * (y + 0.5)) / size - 1) * CELL;
          if (Math.hypot(wx, wz) < 0.37) continue; // under the marble, seen through the glass
          const dr = wz / (Math.sqrt(3) / 2); // world (x, z) to axial, as axialTo3D
          const p = (window as any).__cellToScreen(cq + wx - dr / 2, cr + dr);
          const [px, py] = [Math.round(p.x), Math.round(p.y)];
          const pair = [shownPx.at(px, py), hiddenPx.at(px, py)];
          if (pair[0]!.some((v, i) => Math.abs(v - pair[1]![i]!) > 8)) out.push(pair);
        }
      }
      return out;
    },
    [shown.toString('base64'), hidden.toString('base64'), q, r] as const,
  );
  const ratios = pairs.map(([crack, steel]) => contrastRatio(crack, steel));
  return { shown: ratios.length, reading: ratios.filter((ratio) => ratio >= 3).length };
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

  await openModes(page);
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

// The Hull (#149): a rim cell cracks at ply 8, shows its ticks for 2 plies, then it is a hole. The cracked cell wears
// the crack decal in both quality tiers, with Clear board off and on (#355, world.md section 8), 3:1 on the cell with
// Clear board on: the fog dims the far rim cells under 3:1 (bug #399). The crack's course and the decal's contrast are
// two tests: together they took over 15 s on CI (#431).
// The fight starts, and Clear board flips, by click events on their buttons, the menus closed: opening them is checked
// by the Echo test and clear-board.spec.ts, and each real click cost 1.7 to 2.3 s on CI at 1280 x 720 (#429).
const startHull = async (page: Page, tier: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no animation is checked: slides take no time
  await page.addInitScript((t) => localStorage.setItem('ab-alone.quality', t), tier);
  await page.goto('./');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', tier);
  await page.locator('#boss-list').getByRole('button', { name: 'The Hull', includeHidden: true }).dispatchEvent('click');
  await expect(page.locator('#hud')).toContainText('The Hull');
  await expect(page.locator('body')).toHaveAttribute('data-cracks', '0');
};

for (const tier of ['high', 'low']) {
  test(`start The Hull (${tier} tier), play to the first wave: a cracked cell ticks down, then vanishes, #149`, async ({ page }, testInfo) => {
    const body = page.locator('body');
    const hud = page.locator('#hud');
    const plies = () => page.evaluate(() => (window as any).__plies());
    const click = async (q: number, r: number) => {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    };
    // A forward one-marble move (NW or NE): Black never steps back, so no position repeats. The mouse plays the first
    // one, the gesture that starts the audio of the tell cues, __playTurns the next three (#429, the same moves), the
    // test hook the last (the same handler a click calls).
    const advance = async (mouse: boolean) => {
      const mv = await page.evaluate(() =>
        (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
      );
      const [q, r] = mv.cells[0];
      const send = mouse ? click : (cq: number, cr: number) => page.evaluate(([x, y]) => (window as any).__click(x, y), [cq, cr]);
      await send(q, r);
      await send(mv.dir === 4 ? q : q + 1, r - 1);
    };

    await startHull(page, tier);
    await advance(true);
    await expect.poll(plies, { timeout: 30_000 }).toBe(2); // the boss replied
    expect(await page.evaluate(() => (window as any).__playTurns(3, [4, 2]))).toBe(3);
    await expect.poll(plies, { timeout: 30_000 }).toBe(8);
    await expect(body).toHaveAttribute('data-cracks', '1');
    await expect(hud).toContainText('Rim cracks: 1 cell in 2 plies');
    expect(await tellCues(page)).toEqual(['crack']); // the crack appears
    await page.screenshot({ path: testInfo.outputPath('hull-cracked.png') });

    await advance(false);
    await expect.poll(plies, { timeout: 30_000 }).toBe(10);
    expect(await tellCues(page)).toEqual(['crack', 'crack']); // it ticked down on ply 9, then vanished: no cue for a gone tell
    await expect(body).toHaveAttribute('data-vanished', '1');
    expect(await page.evaluate(() => (window as any).__frame())).toMatchObject({ radius: 4, holes: 1, drawn: true }); // a hole in the frame (#292)
    await expect(body).toHaveAttribute('data-cracks', '0');
    await expect(hud).not.toContainText('Rim cracks');
    expect(await page.evaluate(() => (window as any).__crackDecals())).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('hull-vanished.png') });
  });

  test(`start The Hull (${tier} tier): the cracked cell wears the crack decal, 3:1 with Clear board on, #355`, async ({ page }, testInfo) => {
    const body = page.locator('body');
    await page.setViewportSize({ width: 1280, height: 720 }); // the contrast check's window, as contrast.spec.ts
    await startHull(page, tier);
    expect(await page.evaluate(() => (window as any).__playTurns(4, [4, 2]))).toBe(4); // the forward moves to the crack
    // The decals and the cracked cells in one call to the page (#431): one crack, which wears the decal.
    const { decals, cracks } = await page.evaluate(() => {
      const w = window as any;
      return { decals: w.__crackDecals() as [number, number][], cracks: w.__cracks().map((c: any) => c.cell) };
    });
    expect(cracks).toHaveLength(1);
    expect(decals).toEqual(cracks);
    await page.getByRole('button', { name: 'Clear board', includeHidden: true }).dispatchEvent('click');
    await expect(body).toHaveAttribute('data-clear', 'on');
    expect(await page.evaluate(() => (window as any).__crackDecals())).toEqual(decals);
    const clear = await crackContrast(page, decals[0]!, testInfo.outputPath('hull-cracked-clear.png'));
    expect(clear.shown).toBeGreaterThan(20);
    expect(clear.reading).toBeGreaterThanOrEqual(5);
  });
}

// The Chaplain fight from its start. ?nodes=200: the test budget of the bot and the boss search (bot.ts), 20 boss
// turns cost 27 s on CI at the full budget.
const startChaplain = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // slides take no time, no animation is checked
  await page.goto('./?nodes=200');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Chaplain' }).click();
  await expect(page.locator('#hud')).toContainText('The Chaplain');
  await expect(page.locator('body')).toHaveAttribute('data-converted', '0');
};

const cellScreen = (page: Page, q: number, r: number) =>
  page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]) as Promise<{ x: number; y: number }>;

const chaplainMove = (page: Page, pick: 'forward' | 'exposing') =>
  page.evaluate((how) => {
    const w = window as any;
    return w.__legal().find((m: any) =>
      m.cells.length === 1 && (how === 'forward' ? m.dir === 4 || m.dir === 2 : w.__preview(m).length > 0),
    ) ?? null;
  }, pick);

/** One boss turn: the player's move, then the boss replies. The first ply goes through the mouse, the rest through __click. */
const playChaplainTurn = async (page: Page, n: number) => {
  const mv = await chaplainMove(page, 'forward');
  const [q, r] = mv.cells[0];
  const send = async (cq: number, cr: number) => {
    if (n === 1) {
      const p = await cellScreen(page, cq, cr);
      await page.mouse.click(p.x, p.y);
    } else {
      await page.evaluate(([x, y]) => (window as any).__click(x, y), [cq, cr]);
    }
  };
  await send(q, r);
  await send(mv.dir === 4 ? q : q + 1, r - 1);
  await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(2 * n); // the boss replied
};

// The Chaplain (#150, Decision #154): a hovered move shows the marbles it would expose to a flip at the end of the boss turn.
test('start The Chaplain: a hovered move shows the marbles it exposes, #150', async ({ page }, testInfo) => {
  const body = page.locator('body');
  const hud = page.locator('#hud');
  await startChaplain(page);
  const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];

  let previewed = false;
  for (let n = 1; n <= 20 && !previewed; n++) {
    const exposing = await chaplainMove(page, 'exposing');
    if (exposing) {
      const [q, r] = exposing.cells[0];
      const [dq, dr] = DIRS[exposing.dir]!;
      const at = await cellScreen(page, q, r);
      await page.mouse.click(at.x, at.y); // select the marble
      const flipCues = async () => (await tellCues(page)).filter((c) => c === 'flip').length;
      const heard = await flipCues();
      const t = await cellScreen(page, q + dq!, r + dr!);
      await page.mouse.move(t.x, t.y); // hover the move: ghost and flip preview
      await expect(body).not.toHaveAttribute('data-flips', '0');
      await expect(hud).toContainText('Flips next boss turn');
      await page.mouse.move(t.x + 2, t.y + 2); // the same move still hovered: the same tell, no second cue
      expect(await flipCues()).toBe(heard + 1);
      await page.screenshot({ path: testInfo.outputPath('chaplain-preview.png') });
      const c = await cellScreen(page, q, r);
      await page.mouse.click(c.x, c.y); // deselect
      previewed = true;
    }
    await playChaplainTurn(page, n);
  }
  expect(previewed).toBe(true);
});

// The same fight, a converted marble keeps its own look (#326): its cap reads 3:1 against its shell. With NE moves only
// (direction 2) the conversion comes on the 5th boss turn for every seed (64 seeds checked, #429), not the 18th as with
// the forward moves: the first 4 turns are one __playTurns call (#349), the 5th is two real clicks.
test('start The Chaplain: a converted marble keeps its look, #150', async ({ page }, testInfo) => {
  await startChaplain(page);
  expect(await page.evaluate(() => (window as any).__playTurns(4, [2]))).toBe(4);
  await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(8);
  await expect(page.locator('body')).toHaveAttribute('data-converted', '0');
  // The 5th move and the screen points of its two cells, in one call to the page (#429).
  const points: { x: number; y: number }[] = await page.evaluate(() => {
    const w = window as any;
    const [q, r] = w.__legal().find((m: any) => m.cells.length === 1 && m.dir === 2).cells[0];
    return [w.__cellToScreen(q, r), w.__cellToScreen(q + 1, r - 1)];
  });
  for (const p of points) await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(10); // the boss replied
  await expect(page.locator('body')).not.toHaveAttribute('data-converted', '0');
  await expect(page.locator('#hud')).toContainText('Converted:');
  const cells = await page.evaluate(() => (window as any).__converted());
  const contrasts = await topContrasts(page, cells, testInfo.outputPath('chaplain-converted.png'));
  for (const c of contrasts) expect(c).toBeGreaterThanOrEqual(3); // its cap reads (#326)
});

// Bug #299: a boss turn whose flip costs the boss a marble lost to the void (#207), while its move pushes nothing
// off, threw in afterPlay and skipped the board refresh. Seed 1 and the forward moves reach it on the 18th boss turn.
test('The Chaplain: a boss marble lost for a flip counts for the player and the board is drawn after it, bug #299', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(1)) as typeof crypto.getRandomValues; // the fight seed
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no animation is checked: slides take no time
  await page.goto('./?nodes=200'); // the boss search at the test budget (bot.ts)
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());

  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Chaplain' }).click();
  await expect(hud).toContainText('The Chaplain');
  expect(await page.evaluate(() => (window as any).__fight().seed)).toBe(1);
  // Turns 1 to 17 in one call (#349). The 18th, the flip, is played as before: two __click calls.
  expect(await page.evaluate(() => (window as any).__playTurns(17, [4, 2]))).toBe(17);
  await expect.poll(plies, { timeout: 30_000 }).toBe(34);
  const mv = await page.evaluate(() =>
    (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
  );
  const [q, r] = mv.cells[0];
  const send = (cq: number, cr: number) => page.evaluate(([x, y]) => (window as any).__click(x, y), [cq, cr]);
  await send(q, r);
  await send(mv.dir === 4 ? q : q + 1, r - 1);
  await expect.poll(plies, { timeout: 30_000 }).toBe(36); // the boss replied
  await expect(hud).toContainText('White ejected 1/6'); // the lost boss marble, drawn without a click
  expect(errors).toEqual([]);
});

// The Choir (#183): a radius 3 board, a glyph per army on the boss marbles, only the army in turn
// moves and the next one wears a ring.
test('start The Choir: the boss moves the army in turn, the next army is marked, #183', async ({ page }, testInfo) => {
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

  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Choir' }).click();
  await expect(hud).toContainText('The Choir');
  await expect(hud).toContainText('White ejected 0/10 · Black ejected 0/6');
  await expect(hud).toContainText('Next army: Alto');
  await expect(page.locator('#hud .notch')).toHaveCount(3);
  await expect(body).toHaveAttribute('data-vanished', '24'); // the outer ring is a hole
  await expect(body).toHaveAttribute('data-armies', '12');
  await expect(body).toHaveAttribute('data-next-army', 'Alto');
  expect(await tellCues(page)).toEqual(['choir']); // the next-army tell appears
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
  expect(await tellCues(page)).toEqual(['choir', 'choir']); // once more for Tenor, not for the selection or the human move
  await page.screenshot({ path: testInfo.outputPath('choir-tenor-next.png') });
});

// Task #377: the boss marks stay readable on other shell skins (a pale and a metal one): the Choir army glyphs at the
// start and The Chaplain's cap once a marble is converted, 3:1 as for the default skin (#326).
for (const skin of ['hex', 'riveted']) {
  test(`the Choir glyphs read 3:1 on the ${skin} shell, task #377`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('ab-alone.shell-skin', id), skin);
    await page.goto('./');
    await page.locator('canvas').waitFor();
    await openModes(page);
    await page.getByRole('button', { name: 'Boss fight' }).click();
    await page.locator('#boss-list').getByRole('button', { name: 'The Choir' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-armies', '12');
    const armies = (await page.evaluate(() => (window as any).__armies())) as { cell: [number, number] }[];
    for (const c of await topContrasts(page, armies.map((m) => m.cell))) expect(c).toBeGreaterThanOrEqual(3);
  });

  test(`The Chaplain's cap reads 3:1 on the ${skin} shell, task #377`, async ({ page }, testInfo) => {
    await page.addInitScript((id) => localStorage.setItem('ab-alone.shell-skin', id), skin);
    await startChaplain(page);
    // NE moves only: the conversion on the 5th boss turn, as in the default skin's test (#429).
    expect(await page.evaluate(() => (window as any).__playTurns(4, [2]))).toBe(4);
    await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(8);
    const points: { x: number; y: number }[] = await page.evaluate(() => {
      const w = window as any;
      const [q, r] = w.__legal().find((m: any) => m.cells.length === 1 && m.dir === 2).cells[0];
      return [w.__cellToScreen(q, r), w.__cellToScreen(q + 1, r - 1)];
    });
    for (const p of points) await page.mouse.click(p.x, p.y);
    await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(10);
    await expect(page.locator('body')).not.toHaveAttribute('data-converted', '0');
    const cells = await page.evaluate(() => (window as any).__converted());
    const contrasts = await topContrasts(page, cells, testInfo.outputPath(`chaplain-${skin}.png`));
    for (const c of contrasts) expect(c).toBeGreaterThanOrEqual(3);
  });
}
