import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import type { Terrain } from './openworld';
import { COLOURS, drawMinimap, RADIUS, screenOffset, windowCells, type MinimapData } from './openworldminimap';

// The Open world's minimap (#1410, docs/specs/openworld.md section 8): a 2D canvas drawn from plain data.

/** A canvas context that records what is drawn: each fill with the colour it had, and the paths. */
function fakeContext() {
  const log: string[] = [];
  const fills: { colour: string; at: number[] }[] = [];
  let path: number[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    clearRect: () => log.push('clear'),
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    beginPath: () => (path = []),
    arc: (x: number, y: number, r: number) => path.push(x, y, r),
    moveTo: (x: number, y: number) => path.push(x, y),
    lineTo: (x: number, y: number) => path.push(x, y),
    closePath: () => {},
    clip: () => log.push('clip'),
    stroke: () => log.push('stroke'),
    fill() {
      fills.push({ colour: this.fillStyle, at: path });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ colour: this.fillStyle, at: [x + w / 2, y + h / 2, w, h] });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, fills };
}

const SIZE = 144;
const MIDDLE = SIZE / 2;
const data = (over: Partial<MinimapData> = {}): MinimapData => ({
  cells: [],
  hero: [0, 0],
  troop: [],
  enemies: [],
  lairs: [],
  yaw: 0,
  ...over,
});
const at = (fills: { colour: string; at: number[] }[], colour: string) => fills.filter((f) => f.colour === colour);

describe('screenOffset', () => {
  it('puts a cell where the 3D view puts it, relative to the hero: the board layout at yaw 0, up is -r', () => {
    expect(screenOffset([0, 0], [1, 0], 0)).toEqual({ x: 1, y: expect.closeTo(0) });
    const down = screenOffset([0, 0], [0, 1], 0);
    expect(down.x).toBeCloseTo(0.5);
    expect(down.y).toBeCloseTo(Math.sqrt(3) / 2);
    expect(screenOffset([2, 3], [2, 2], 0).y).toBeLessThan(0);
  });

  it('turns with the camera: screen up is the far side of the yaw, so a quarter turn puts -x up', () => {
    const up = screenOffset([0, 0], [-1, 0], Math.PI / 2);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
  });
});

describe('windowCells', () => {
  it('reads the hex disc of RADIUS cells round the hero, skipping cells off the world', () => {
    const all = windowCells(() => 'grass', [10, -4]);
    expect(all).toHaveLength(3 * RADIUS * RADIUS + 3 * RADIUS + 1);
    expect(all).toContainEqual([10, -4, 'grass']);
    const cells = windowCells((q): Terrain | undefined => (q < 0 ? undefined : 'sand'), [0, 0]);
    expect(cells.length).toBeLessThan(all.length);
    expect(cells.every(([q]) => q >= 0)).toBe(true);
  });
});

describe('drawMinimap', () => {
  it('clears, clips to a circle and paints each cell in the colour of its terrain', () => {
    const { ctx, log, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ cells: [[3, 0, 'water'], [-3, 0, 'peak']] }));
    expect(log.slice(0, 3)).toEqual(['clear', 'save', 'clip']);
    expect(log).toContain('restore');
    const water = at(fills, COLOURS.water);
    expect(water).toHaveLength(1);
    expect(water[0]!.at[0]).toBeGreaterThan(MIDDLE);
    expect(at(fills, COLOURS.peak)[0]!.at[0]).toBeLessThan(MIDDLE);
  });

  it('draws the cells turned with the yaw, so up is up on screen', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ cells: [[-3, 0, 'rock']], yaw: Math.PI / 2 }));
    const [x, y] = at(fills, COLOURS.rock)[0]!.at;
    expect(x).toBeCloseTo(MIDDLE);
    expect(y).toBeLessThan(MIDDLE);
  });

  it('draws the hero in the middle, the troop and the enemies in their own colours', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ troop: [[1, 0], [0, 1]], enemies: [[0, -4]] }));
    expect(at(fills, COLOURS.hero)[0]!.at.slice(0, 2)).toEqual([MIDDLE, MIDDLE]);
    expect(at(fills, COLOURS.troop)).toHaveLength(2);
    const [, y] = at(fills, COLOURS.enemy)[0]!.at;
    expect(y).toBeLessThan(MIDDLE);
  });

  it('draws a lair in the window, a beaten one in another colour', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ lairs: [{ cell: [5, 0], beaten: false }, { cell: [-5, 0], beaten: true }] }));
    expect(at(fills, COLOURS.lair)).toHaveLength(1);
    expect(at(fills, COLOURS.lairBeaten)).toHaveLength(1);
    expect(COLOURS.lair).not.toBe(COLOURS.lairBeaten);
  });

  it('draws a lair out of the window as an arrow on the edge pointing to it', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ lairs: [{ cell: [200, 0], beaten: false }, { cell: [100, -200], beaten: true }] }));
    const [right] = at(fills, COLOURS.lair);
    const [x, y] = right!.at;
    expect(x).toBeGreaterThan(MIDDLE + SIZE / 4);
    expect(x).toBeLessThan(SIZE);
    expect(y).toBeCloseTo(MIDDLE);
    expect(right!.at).toHaveLength(6); // a triangle: three points
    const [top] = at(fills, COLOURS.lairBeaten);
    expect(top!.at[1]).toBeLessThan(MIDDLE - SIZE / 4);
    expect(top!.at[0]).toBeCloseTo(MIDDLE);
  });
});
