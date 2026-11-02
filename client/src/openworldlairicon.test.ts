import { describe, expect, it } from 'vitest';
import { contrastRatio, type RGB } from './contrast';
import { setNeonWorldOn } from './neonlook';
import { TERRAINS } from './openworld';
import { BOSS_COLOURS, ICON, iconSize, lairIcon } from './openworldlairicon';
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

  it('read 3:1 over the plate, and the ink of the letter reads 3:1 over them', () => {
    for (const colour of [...Object.values(BOSS_COLOURS), ICON.unknown]) {
      expect(contrastRatio(rgb(colour), rgb(ICON.plate))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(rgb(colour), rgb(ICON.ink))).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(rgb(ICON.done), rgb(ICON.plate))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(rgb(ICON.check), rgb(ICON.done))).toBeGreaterThanOrEqual(3);
  });

  it('keep the edge of the icon 3:1 over every terrain, in the plain look and in the neon one: the dark halo or the light rim reads on each', () => {
    for (const neon of [false, true]) {
      setNeonWorldOn(neon);
      for (const terrain of TERRAINS) {
        const ground = rgb(terrainColour(terrain));
        const best = Math.max(contrastRatio(rgb(ICON.halo), ground), contrastRatio(rgb(ICON.rim), ground));
        expect(best, `${terrain} (neon ${neon})`).toBeGreaterThanOrEqual(3);
      }
    }
    setNeonWorldOn(false);
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
