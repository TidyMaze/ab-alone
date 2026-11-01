import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';
import { ANNOUNCED_AT, CONVERTED_AT, EXPLODED_AT, SEED, parseRecorded } from '../src/test/chaplain-game';
import { openModes } from './modes';

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

// Bug #326: a tell drawn on top of a boss marble (a Choir army glyph, the glass half of a marble The Chaplain converted,
// #508) reads 3:1 against
// the shell it sits on (world.md section 5, Tell marks). For each cell, the contrast (WCAG 2) of the brightest to the
// darkest pixel of a small box where the top of its marble is drawn, read from one screenshot. The box follows the
// cell spacing, so it holds at any window size.
// `path` keeps the screenshot read, for the report (#429). `lift` is the height of the tell above the board: the box then
// sits where the tell is drawn, which for a cell far from the centre is not above its centre (bug #1259: a Choir glyph
// of the outer column sat 12 px out of the box, which read the glyph's edge or nothing, 2.26 to 4.9 from run to run).
const topContrasts = async (page: Page, cells: [number, number][], path?: string, lift?: number): Promise<number[]> => {
  // A frame drawn after this call sees the marks the caller just waited for (#383): two rAF can miss it.
  await freshDraw(page);
  const png = (await page.screenshot({ path })).toString('base64');
  return page.evaluate(
    async ([b64, list, lift]) => {
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
        const at = lift === undefined ? { x: c.x, y: c.y - step * 0.55 } : toScreen(q, r, lift);
        const d = g.getImageData(Math.round(at.x) - half, Math.round(at.y) - half, 2 * half, 2 * half).data;
        const lum: number[] = [];
        for (let i = 0; i < d.length; i += 4) {
          lum.push(0.2126 * linear(d[i]!) + 0.7152 * linear(d[i + 1]!) + 0.0722 * linear(d[i + 2]!));
        }
        return (Math.max(...lum) + 0.05) / (Math.min(...lum) + 0.05);
      });
    },
    [png, cells, lift] as const,
  );
};

// The height of the Choir army glyphs above the board (main.ts, the glyph's y).
const CHOIR_GLYPH_LIFT = 0.76;

// #358: every boss tell has a sound twin, played when the tell appears or changes. window.__tellCues() lists the cues
// played so far. The clicks that open the fight are the gesture that starts the audio.
const tellCues = (page: Page) => page.evaluate(() => (window as any).__tellCues()) as Promise<string[]>;

// The source of the decal: the page loads it as KTX2 (#700), which no canvas reads.
const CRACK_DECAL = readFileSync(new URL('../textures/crack-decal.png', import.meta.url)).toString('base64');

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
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
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
    async ([a, b, cq, cr, decalPng]) => {
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
      const decal = await pixels(`data:image/png;base64,${decalPng}`);
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
    [shown.toString('base64'), hidden.toString('base64'), q, r, CRACK_DECAL] as const,
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
  await expect(page.locator('#boss-bar .name')).toContainText('The Echo');
  await expect(hud).toContainText('P1');
  await expect(hud).toContainText('White to move');
  await expect(page.locator('#hud .notch.active')).toHaveText('P1');

  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  // The boss answers in the worker: two plies, the HUD is back on the human side.
  await expect.poll(plies, { timeout: 30_000 }).toBe(2);
  await expect(hud).toContainText('White to move');
  await expect(page.locator('#boss-bar .name')).toContainText('The Echo');
  await page.screenshot({ path: 'test-results/boss-hud.png', clip: { x: 0, y: 0, width: 420, height: 260 } });

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(plies).toBe(0);
  await expect(hud).toContainText('White to move');
  await expect(page.locator('#boss-bar .name')).toContainText('The Echo');
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

// The Hull (#149): a rim cell cracks at ply 8, shows its ticks for 2 player turns, then it is a hole. The cracked cell wears
// the crack decal in both quality tiers, with Clear board off and on (#355, world.md section 8), 3:1 on the cell with
// Clear board on: the fog dims the far rim cells under 3:1 (bug #399). The crack's course and the decal's contrast are
// two tests: together they took over 15 s on CI (#431).
// The fight starts, and Clear board flips, by click events on their buttons, the menus closed: opening them is checked
// by the Echo test and clear-board.spec.ts, and each real click cost 1.7 to 2.3 s on CI at 1280 x 720 (#429).
// CRACK_SEED puts the crack on a cell in the open, seen whole (seeds 2, 4 and 6 hide it behind a marble).
const CRACK_SEED = 1;
// `seed` fixes the fight (#1195): the cracked cell is the same every run, and ?nodes=200 makes the replies the same, so the
// decal is not left behind a marble from time to time.
const startHull = async (page: Page, tier: string, seed?: number) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no animation is checked: slides take no time
  await page.addInitScript((t) => localStorage.setItem('ab-alone.tier', t), tier);
  if (seed !== undefined) {
    await page.addInitScript((fill) => {
      crypto.getRandomValues = ((a: Uint32Array) => a.fill(fill)) as typeof crypto.getRandomValues;
    }, seed);
  }
  await page.goto(seed === undefined ? './' : './?nodes=200');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', tier);
  await page.locator('#boss-list').getByRole('button', { name: 'The Hull', includeHidden: true }).dispatchEvent('click');
  await expect(page.locator('#boss-bar .name')).toContainText('The Hull');
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
    await expect(hud).toContainText('Cracks: 1 cell in 2 turns');
    expect(await tellCues(page)).toEqual(['crack']); // the crack appears
    await page.screenshot({ path: testInfo.outputPath('hull-cracked.png') });

    await advance(false);
    await expect.poll(plies, { timeout: 30_000 }).toBe(10);
    expect(await tellCues(page)).toEqual(['crack', 'crack']); // it ticked down on ply 9
    await expect(body).toHaveAttribute('data-cracks', '1');
    await advance(false);
    await expect.poll(plies, { timeout: 30_000 }).toBe(12);
    expect(await tellCues(page)).toEqual(['crack', 'crack']); // then vanished on ply 11: no cue for a gone tell
    await expect(body).toHaveAttribute('data-vanished', '1');
    expect(await page.evaluate(() => (window as any).__frame())).toMatchObject({ radius: 4, holes: 1, drawn: true, dishes: 60 }); // a hole in the frame (#292), one dish fewer on the terrace (#1374)
    await expect(body).toHaveAttribute('data-cracks', '0');
    await expect(hud).not.toContainText('Cracks:');
    expect(await page.evaluate(() => (window as any).__crackDecals())).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('hull-vanished.png') });
  });

  test(`start The Hull (${tier} tier): the cracked cell wears the crack decal, 3:1 with Clear board on, #355`, async ({ page }, testInfo) => {
    const body = page.locator('body');
    await page.setViewportSize({ width: 1280, height: 720 }); // the contrast check's window, as contrast.spec.ts
    await startHull(page, tier, CRACK_SEED);
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

// The Chaplain fight from its start, on the fight seed of the recorded game (#748): the plies of the core fixture are played
// by one call (__playMoves), the way every other spec loads the state it needs. ?nodes=200: the test budget of the boss search.
const startChaplain = async (page: Page, { reduced = true } = {}) => {
  await page.addInitScript((seed) => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(seed)) as typeof crypto.getRandomValues; // the fight seed
  }, SEED);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('./?nodes=200');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Chaplain' }).click();
  await expect(page.locator('#boss-bar .name')).toContainText('The Chaplain');
  await expect(page.locator('body')).toHaveAttribute('data-converted', '0');
};

/** Plays the recorded plies `from` to `to` (excluded). */
const recordedGame = () =>
  parseRecorded(readFileSync(new URL('../../crates/abalone-core/tests/fixtures/chaplain.txt', import.meta.url), 'utf8'));
const playRecorded = (page: Page, from: number, to: number) =>
  page.evaluate((records) => (window as any).__playMoves(records), recordedGame().slice(from, to));

const cellScreen = (page: Page, q: number, r: number) =>
  page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]) as Promise<{ x: number; y: number }>;

// The Chaplain (#150, #748): a hovered move shows the marbles it would flip at the end of the turn it plays.
test('start The Chaplain: a hovered move shows the marbles it flips, #150', async ({ page }, testInfo) => {
  const body = page.locator('body');
  const hud = page.locator('#hud');
  await startChaplain(page);
  const DIRS = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
  const exposing = () =>
    page.evaluate(() => {
      const w = window as any;
      return w.__legal().find((m: any) => m.cells.length === 1 && w.__preview(m).length > 0) ?? null;
    });

  let found = await exposing();
  for (let k = 0; k < EXPLODED_AT && !found; k += 2) {
    await playRecorded(page, k, k + 2);
    found = await exposing();
  }
  expect(found).not.toBeNull();
  const [q, r] = found.cells[0];
  const [dq, dr] = DIRS[found.dir]!;
  const at = await cellScreen(page, q, r);
  await page.mouse.click(at.x, at.y); // select the marble
  const flipCues = async () => (await tellCues(page)).filter((c) => c === 'flip').length;
  const heard = await flipCues();
  const t = await cellScreen(page, q + dq!, r + dr!);
  await page.mouse.move(t.x, t.y); // hover the move: ghost and flip preview
  await expect(body).not.toHaveAttribute('data-flips', '0');
  await expect(hud).toContainText('Flips this turn');
  await page.mouse.move(t.x + 2, t.y + 2); // the same move still hovered: the same tell, no second cue
  expect(await flipCues()).toBe(heard + 1);
  await page.screenshot({ path: testInfo.outputPath('chaplain-preview.png') });
});

// The same fight, a converted marble keeps its own look (#326): half ridged shell, half glass (no hidden core since #886), under
// the wax (#508), its glass half 3:1 against its shell. The recorded game converts its first marble at ply 24.
test('start The Chaplain: a converted marble keeps its look, #150', async ({ page }, testInfo) => {
  await startChaplain(page);
  await playRecorded(page, 0, CONVERTED_AT - 1);
  await expect(page.locator('body')).toHaveAttribute('data-converted', '0');
  await playRecorded(page, CONVERTED_AT - 1, CONVERTED_AT);
  await expect(page.locator('body')).not.toHaveAttribute('data-converted', '0');
  await expect(page.locator('#hud')).toContainText('Converted:');
  const cells = await page.evaluate(() => (window as any).__converted());
  const looks = await page.evaluate(() => (window as any).__convertedLooks());
  expect(looks).toHaveLength(cells.length);
  expect(looks).toEqual(expect.arrayContaining(cells.map((cell: [number, number]) => ({ cell, parts: ['wax', 'shell', 'glass', 'cracks', 'glyph', 'glyph-outline'] }))));
  const contrasts = await topContrasts(page, cells, testInfo.outputPath('chaplain-converted.png'));
  for (const c of contrasts) expect(c).toBeGreaterThanOrEqual(3); // its glass half reads (#326, #508)
});

// The Chaplain's martyr (#748): after 4 ejections one boss marble wears the tell and the HUD says it explodes; the next boss
// turn it explodes, a flash and a ring of shards, and counts as the 5th ejection. Reduced motion: a static flash, no shard.
test('The Chaplain: a martyr is announced, then explodes and counts as the 5th ejection, #748', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = page.locator('body');
  await startChaplain(page, { reduced: false });
  await playRecorded(page, 0, ANNOUNCED_AT);
  await expect(body).not.toHaveAttribute('data-martyr', '');
  await expect(page.locator('#hud')).toContainText('Martyr marked');
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('chaplain-martyr.png') });
  await playRecorded(page, ANNOUNCED_AT, EXPLODED_AT);
  await expect(body).toHaveAttribute('data-martyr', '');
  await expect(body).toHaveAttribute('data-explosions', '1');
  await page.screenshot({ path: testInfo.outputPath('chaplain-explosion.png') }); // the flash and the shards
  await expect(body).toHaveAttribute('data-martyr', '');
  await expect(page.locator('#hud')).toContainText('White ejected 5/6');
  expect(await page.evaluate(() => (window as any).__blast()?.shards)).toBe(8);
  await expect(body).not.toHaveAttribute('data-exploding', '1', { timeout: 5_000 }); // and gone
  expect(errors).toEqual([]);
});

// The Choir (#183, #747): the standard board, a glyph per army on the boss marbles, only the army in turn
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
  await expect(page.locator('#boss-bar .name')).toContainText('The Choir');
  await expect(hud).toContainText('White ejected 0/6 · Black ejected 0/6');
  await expect(hud).toContainText('Next army: Alto');
  await expect(page.locator('#hud .notch')).toHaveCount(3);
  await expect(body).toHaveAttribute('data-vanished', '0'); // the standard board
  await expect(body).toHaveAttribute('data-armies', '18');
  await expect(body).toHaveAttribute('data-next-army', 'Alto');
  expect(await tellCues(page)).toEqual(['choir']); // the next-army tell appears
  await page.screenshot({ path: testInfo.outputPath('choir-start.png') });

  const before = await armies();
  for (const c of await topContrasts(page, before.map((m) => m.cell), undefined, CHOIR_GLYPH_LIFT)) expect(c).toBeGreaterThanOrEqual(3); // #326
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
// start and a converted marble's glass half once The Chaplain converts one, 3:1 as for the default skin (#326, #508).
for (const skin of ['hex', 'riveted']) {
  test(`the Choir glyphs read 3:1 on the ${skin} shell, task #377`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('ab-alone.shell-skin', id), skin);
    await page.goto('./');
    await page.locator('canvas').waitFor();
    await openModes(page);
    await page.getByRole('button', { name: 'Boss fight' }).click();
    await page.locator('#boss-list').getByRole('button', { name: 'The Choir' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-armies', '18');
    const armies = (await page.evaluate(() => (window as any).__armies())) as { cell: [number, number] }[];
    for (const c of await topContrasts(page, armies.map((m) => m.cell), undefined, CHOIR_GLYPH_LIFT)) expect(c).toBeGreaterThanOrEqual(3);
  });

  test(`The Chaplain's converted marble reads 3:1 on the ${skin} shell, task #377`, async ({ page }, testInfo) => {
    await page.addInitScript((id) => localStorage.setItem('ab-alone.shell-skin', id), skin);
    await startChaplain(page);
    await playRecorded(page, 0, CONVERTED_AT); // the recorded game converts its first marble at ply 24
    await expect(page.locator('body')).not.toHaveAttribute('data-converted', '0');
    const cells = await page.evaluate(() => (window as any).__converted());
    const contrasts = await topContrasts(page, cells, testInfo.outputPath(`chaplain-${skin}.png`));
    for (const c of contrasts) expect(c).toBeGreaterThanOrEqual(3);
  });
}

// Task #507: in boss mode the shells of the boss side wear their boss's accent (world.md section 5), a rust crown for
// The Hull, candle wax for The Chaplain, under any palette, safe mode and Clear board. window.__accents() lists the cells
// whose marble wears one. The screenshot is kept for the report.
for (const [name, accent, stored] of [
  ['The Hull', 'crown', { 'ab-alone.palette': 'contrast' }],
  ['The Chaplain', 'wax', { 'ab-alone.safe-mode': 'off', 'ab-alone.clear-board': 'on' }],
] as const) {
  test(`the boss side wears ${name}'s ${accent}, task #507`, async ({ page }, testInfo) => {
    await page.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }, stored);
    await page.goto(accent === 'crown' ? './?scene=room' : './'); // the terrace leaves the Hull's crown off (#1374)
    await page.locator('canvas').waitFor();
    await page.locator('#boss-list').getByRole('button', { name, includeHidden: true }).dispatchEvent('click');
    await expect(page.locator('#boss-bar .name')).toContainText(name);
    const worn = (await page.evaluate(() => (window as any).__accents())) as { cell: [number, number]; accent: string }[];
    expect(worn).toHaveLength(14);
    expect(worn.every((w) => w.accent === accent)).toBe(true);
    await freshDraw(page);
    await page.screenshot({ path: testInfo.outputPath(`accent-${accent}.png`) });
  });
}

// Task #564: The Ballast Mind is in the boss list. Its fight plays on the Bridge, on a radius 5 board with six void
// pillars, and its 16 shells wear the wire wrap (#507). The screenshot is kept for the report.
test('start The Ballast Mind: its radius 5 board on the Bridge, its shells in the wire wrap, task #564', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Ballast Mind' }).click();
  await expect(page.locator('#boss-bar .name')).toContainText('The Ballast Mind');
  await expect(page.locator('#hud')).toContainText('White ejected 0/12 · Black ejected 0/12');
  await expect(body).toHaveAttribute('data-deck', 'bridge');
  await expect(body).toHaveAttribute('data-vanished', '6'); // the pillars
  expect(await page.evaluate(() => (window as any).__frame())).toMatchObject({ radius: 5, holes: 6 });
  const worn = (await page.evaluate(() => (window as any).__accents())) as { cell: [number, number]; accent: string }[];
  expect(worn).toHaveLength(16);
  expect(worn.every((w) => w.accent === 'wire')).toBe(true);
  expect(worn.some((w) => Math.abs(w.cell[0]) === 5)).toBe(true); // ring 5 is drawn too
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('ballast-start.png') });
});

// Task #573: The Ballast Mind default view and reset view frame its whole radius 5 board
test('The Ballast Mind radius 5 board frames in 1280x720 and phone upright, task #573', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Ballast Mind' }).click();
  await expect(page.locator('#boss-bar .name')).toContainText('The Ballast Mind');

  // Verify all radius 5 cells fit within the 1280x720 viewport
  const cells = await page.evaluate(() => {
    const list: [number, number][] = [];
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 5) {
          list.push([q, r]);
        }
      }
    }
    const toScreen = (window as any).__cellToScreen;
    return list.map(([q, r]) => ({ q, r, ...toScreen(q, r) }));
  });
  expect(cells.every((c) => c.x > 30 && c.x < 1250 && c.y > 30 && c.y < 690)).toBe(true);

  // Reset view keeps the framing
  await page.getByRole('button', { name: 'Reset view' }).click();
  const resetCells = await page.evaluate(() => {
    const toScreen = (window as any).__cellToScreen;
    return [toScreen(0, 5), toScreen(0, -5)];
  });
  expect(resetCells[0].y).toBeLessThan(690);
  expect(resetCells[1].y).toBeGreaterThan(30);

  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('ballast-view-1280x720.png') });

  // On a phone held upright
  await page.setViewportSize({ width: 375, height: 812 });
  await freshDraw(page);
  const phoneCells = await page.evaluate(() => {
    const toScreen = (window as any).__cellToScreen;
    return [toScreen(-5, 0), toScreen(5, 0), toScreen(0, 5)];
  });
  expect(phoneCells[0].x).toBeGreaterThan(10);
  expect(phoneCells[1].x).toBeLessThan(365);
  expect(phoneCells[2].y).toBeLessThan(780);
  await page.screenshot({ path: testInfo.outputPath('ballast-view-phone.png') });
});
