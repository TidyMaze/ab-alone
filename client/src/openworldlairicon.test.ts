import { describe, expect, it } from 'vitest';
import type { RGB } from './palettes';
import { setNeonWorldOn } from './neonlook';
import { TERRAINS } from './openworld';
import { BOSS_COLOURS, dungeonIcon, ICON, iconSize, lairIcon, logIcon, portalIcon, townIcon } from './openworldlairicon';
import { terrainColour } from './openworldminimap';

// The icon of a boss tower on the Open world map and minimap (#1438): a tower on a dark plate, in the boss's colour.

const BOSSES = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker', 'swarm'];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as RGB;

/** A context that records the fills, the strokes (with their colour and width) and the texts. */
function fakeContext() {
  const fills: { colour: string; points: number[] }[] = [];
  const strokes: { colour: string; width: number; points: number[] }[] = [];
  const texts: { text: string; colour: string; x: number; y: number }[] = [];
  let path: number[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    beginPath: () => (path = []),
    moveTo: (x: number, y: number) => path.push(x, y),
    lineTo: (x: number, y: number) => path.push(x, y),
    arc: (x: number, y: number, r: number) => path.push(x, y, r),
    closePath: () => {},
    fill() {
      fills.push({ colour: this.fillStyle, points: path });
    },
    stroke() {
      strokes.push({ colour: this.strokeStyle, width: this.lineWidth, points: path });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, colour: this.fillStyle, x, y });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, strokes, texts };
}

describe('the boss colours', () => {
  it('give each of the 15 bosses its own colour', () => {
    expect(Object.keys(BOSS_COLOURS).sort()).toEqual([...BOSSES].sort());
    expect(new Set(Object.values(BOSS_COLOURS)).size).toBe(BOSSES.length);
  });


});

describe('iconSize', () => {
  it('keeps a minimum on the map when it is zoomed out, grows with the zoom, and is smaller and fixed on the minimap', () => {
    expect(iconSize(3, false)).toBe(iconSize(8, false));
    expect(iconSize(32, false)).toBeGreaterThan(iconSize(8, false));
    expect(iconSize(5.76, true)).toBeLessThan(iconSize(8, false));
    expect(iconSize(5.76, true)).toBe(iconSize(1, true));
  });
});

describe('lairIcon', () => {
  it('draws a plate with a halo and a rim, then the tower in the boss colour, and the initial of the boss on it', () => {
    const { ctx, fills, strokes, texts } = fakeContext();
    lairIcon(ctx, 100, 50, 30, 'hull', false);
    expect(fills[0]!.colour).toBe(ICON.plate);
    expect(strokes.map((s) => s.colour)).toEqual([ICON.halo, ICON.rim]);
    expect(strokes[0]!.width).toBeGreaterThan(strokes[1]!.width);
    const tower = fills.find((f) => f.colour === BOSS_COLOURS.hull)!;
    expect(tower.points.length).toBeGreaterThan(8); // crenels: more than a box
    const xs = tower.points.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(85);
    expect(Math.max(...xs)).toBeLessThan(115);
    expect(texts).toEqual([expect.objectContaining({ text: 'H', colour: ICON.ink })]);
  });

  it('gives two bosses two icons', () => {
    const [a, b] = [fakeContext(), fakeContext()];
    lairIcon(a.ctx, 0, 0, 30, 'hull', false);
    lairIcon(b.ctx, 0, 0, 30, 'echo', false);
    expect(a.fills.map((f) => f.colour)).not.toEqual(b.fills.map((f) => f.colour));
    expect(a.texts[0]!.text).not.toBe(b.texts[0]!.text);
  });

  it('leaves the letter out when the icon is small', () => {
    const { ctx, texts, fills } = fakeContext();
    lairIcon(ctx, 0, 0, 16, 'hull', false);
    expect(texts).toEqual([]);
    expect(fills.some((f) => f.colour === BOSS_COLOURS.hull)).toBe(true);
  });

  it('draws a beaten tower grey, with a check mark and no letter, never in the boss colour', () => {
    const { ctx, fills, strokes, texts } = fakeContext();
    lairIcon(ctx, 0, 0, 30, 'hull', true);
    expect(fills.some((f) => f.colour === ICON.done)).toBe(true);
    expect(fills.some((f) => f.colour === BOSS_COLOURS.hull)).toBe(false);
    expect(strokes.map((s) => s.colour)).toContain(ICON.check);
    expect(texts).toEqual([]);
  });

  it('draws a lair of an unknown boss in a plain colour, without a letter', () => {
    for (const boss of [undefined, 'nobody']) {
      const { ctx, fills, texts } = fakeContext();
      lairIcon(ctx, 0, 0, 30, boss, false);
      expect(fills.some((f) => f.colour === ICON.unknown)).toBe(true);
      expect(texts).toEqual([]);
    }
  });
});

describe('portalIcon (#1443)', () => {
  it('draws a round plate with a halo and a rim, a violet ring and a core: no tower in it', () => {
    const { ctx, fills, strokes } = fakeContext();
    portalIcon(ctx, 100, 50, 30, false);
    expect(fills[0]).toEqual({ colour: ICON.plate, points: [100, 50, 15] }); // a disc, the tower's plate is a square
    expect(strokes.slice(0, 2).map((s) => s.colour)).toEqual([ICON.halo, ICON.rim]);
    expect(strokes.some((s) => s.colour === ICON.portal)).toBe(true);
    expect(fills.some((f) => f.colour === ICON.portal)).toBe(true);
    for (const f of fills) expect(f.points).toHaveLength(3); // arcs only: no crenellated tower
  });

  it('lights the core when the hero stands on it', () => {
    const [off, on] = [fakeContext(), fakeContext()];
    portalIcon(off.ctx, 0, 0, 30, false);
    portalIcon(on.ctx, 0, 0, 30, true);
    expect(off.fills.some((f) => f.colour === ICON.here)).toBe(false);
    expect(on.fills.some((f) => f.colour === ICON.here)).toBe(true);
  });
});

describe('logIcon (#1589)', () => {
  it('draws a diamond plate with a halo and a rim and a filled amber slab: neither a tower nor a portal', () => {
    const { ctx, fills, strokes } = fakeContext();
    logIcon(ctx, 100, 50, 30, false);
    expect(fills[0]!.colour).toBe(ICON.plate);
    expect(fills[0]!.points).toHaveLength(8); // four points: a diamond, the tower's plate is a square of other points
    expect(fills[0]!.points.slice(0, 2)).toEqual([100, 35]); // pointing up
    expect(strokes.slice(0, 2).map((s) => s.colour)).toEqual([ICON.halo, ICON.rim]);
    expect(fills.some((f) => f.colour === ICON.log)).toBe(true);
    for (const f of fills) expect(f.points.length).toBeLessThanOrEqual(12); // no crenellated tower: that one has 12 points
  });

  it('draws a log found as an outline of the slab in the grey of a beaten tower, never in amber', () => {
    const [open, found] = [fakeContext(), fakeContext()];
    logIcon(open.ctx, 0, 0, 30, false);
    logIcon(found.ctx, 0, 0, 30, true);
    expect(found.fills.some((f) => f.colour === ICON.log)).toBe(false);
    expect(found.strokes.some((s) => s.colour === ICON.done)).toBe(true);
    expect(open.strokes.some((s) => s.colour === ICON.done)).toBe(false);
  });
});

describe('townIcon and dungeonIcon (#1514)', () => {
  it('draw a town as the cyan spire of its silhouette in the world (#1518) on a hexagonal plate with a halo and a rim', () => {
    const { ctx, fills, strokes } = fakeContext();
    townIcon(ctx, 100, 50, 30);
    expect(fills[0]!.colour).toBe(ICON.plate);
    expect(fills[0]!.points).toHaveLength(12); // six points: the tower's plate has four
    expect(strokes.slice(0, 2).map((s) => s.colour)).toEqual([ICON.halo, ICON.rim]);
    expect(ICON.town).toBe('#19e6ff');
    const spire = fills.find((f) => f.colour === ICON.town)!;
    expect(spire.points).toHaveLength(10); // five points: a spike on a foot
    const xs = spire.points.filter((_, i) => i % 2 === 0);
    const ys = spire.points.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1.5 * (Math.max(...xs) - Math.min(...xs))); // taller than wide
    expect(xs[ys.indexOf(Math.min(...ys))]).toBe(100); // the tip on the middle
    const small = fakeContext();
    townIcon(small.ctx, 0, 0, 20); // the minimap's size: the spire stands at least 16 px tall (art, #1518)
    const smallYs = small.fills.find((f) => f.colour === ICON.town)!.points.filter((_, i) => i % 2 === 1);
    expect(Math.max(...smallYs) - Math.min(...smallYs)).toBeGreaterThanOrEqual(16);
  });

  it('draw a dungeon gate as the round sodium arch of its silhouette (#1518) on a triangular plate, with the same halo and rim', () => {
    const { ctx, fills, strokes } = fakeContext();
    dungeonIcon(ctx, 100, 50, 30);
    expect(fills[0]!.colour).toBe(ICON.plate);
    expect(fills[0]!.points).toHaveLength(6); // three points
    expect(strokes.slice(0, 2).map((s) => s.colour)).toEqual([ICON.halo, ICON.rim]);
    expect(ICON.dungeon).toBe('#d9822b');
    const arch = fills.find((f) => f.colour === ICON.dungeon)!;
    const ys = new Set(arch.points.filter((_, i) => i % 2 === 1).map((y) => y.toFixed(2)));
    expect(ys.size).toBeGreaterThan(6); // a round top, not a square doorway
  });

  it('give a town, a dungeon, a tower, a portal and a log five different plates', () => {
    const plates = [townIcon, dungeonIcon].map((draw) => {
      const { ctx, fills } = fakeContext();
      draw(ctx, 0, 0, 30);
      return JSON.stringify(fills[0]!.points);
    });
    const tower = fakeContext();
    lairIcon(tower.ctx, 0, 0, 30, 'hull', false);
    const portal = fakeContext();
    portalIcon(portal.ctx, 0, 0, 30, false);
    const log = fakeContext();
    logIcon(log.ctx, 0, 0, 30, false);
    plates.push(...[tower, portal, log].map((c) => JSON.stringify(c.fills[0]!.points)));
    expect(new Set(plates).size).toBe(5);
  });
});
