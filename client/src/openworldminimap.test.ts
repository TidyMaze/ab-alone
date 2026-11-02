import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import type { Terrain } from './openworld';
import { LOOK, PROPS, WATER } from './openworldview';
import { contrastRatio, type RGB } from './contrast';
import { setNeonWorldOn } from './neonlook';
import { mapColour, WORLD } from './neonworld';
import { WALKABLE } from './openworld';
import { BOSS_COLOURS, ICON } from './openworldlairicon';
import { COLOURS, drawMap, drawMinimap, groundOffset, RADIUS, screenOffset, terrainColour, windowCells, type MinimapData } from './openworldminimap';

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
    fillText: () => {},
    stroke() {
      log.push(this.strokeStyle === COLOURS.chosen ? 'stroke chosen' : 'stroke');
    },
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
  teleporters: [],
  yaw: 0,
  ...over,
});
const at = (fills: { colour: string; at: number[] }[], colour: string) => fills.filter((f) => f.colour === colour);

describe('terrainColour', () => {
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  it('is the colour of the 3D view: the ground of LOOK, the lake shore, the props', () => {
    expect(terrainColour('grass')).toBe(hex(LOOK.grass.color));
    expect(terrainColour('sand')).toBe(hex(LOOK.sand.color));
    expect(terrainColour('rock')).toBe(hex(LOOK.rock.color));
    expect(terrainColour('water')).toBe(hex(WATER.shore));
    expect(terrainColour('tree')).toBe(hex(PROPS.tree.color));
    expect(terrainColour('boulder')).toBe(hex(PROPS.boulder.color));
  });

  describe('the mountain you cannot cross (#1439)', () => {
    const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
    const rgb = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as unknown as RGB;
    const ratio = (a: string, b: string): number => contrastRatio(rgb(a), rgb(b));

    it('is the peak and the wall, which the core blocks (the walkable terrains of openworld.ts), never the walkable rock', () => {
      expect(WALKABLE.has('rock')).toBe(true);
      for (const terrain of ['peak', 'wall'] as const) {
        expect(WALKABLE.has(terrain)).toBe(false);
        expect(terrainColour(terrain)).toBe(COLOURS.mountain);
      }
      expect(terrainColour('rock')).not.toBe(COLOURS.mountain);
    });

    it('reads 3:1 against the walkable rock, in the plain look and in the neon one (its rock, lifted for the map)', () => {
      expect(ratio(terrainColour('peak'), terrainColour('rock'))).toBeGreaterThanOrEqual(3);
      expect(ratio(COLOURS.mountain, hex(mapColour(WORLD.rock)))).toBeGreaterThanOrEqual(3);
      setNeonWorldOn(true);
      expect(terrainColour('wall')).toBe(COLOURS.mountain); // the neon look keeps it
      setNeonWorldOn(false);
    });

    it('keeps the hero, the troop and the tower icons readable on the mountain and on the rock', () => {
      for (const ground of [terrainColour('peak'), terrainColour('rock')]) {
        for (const mark of [COLOURS.hero, COLOURS.troop]) expect(Math.max(ratio(mark, ground), ratio(COLOURS.edge, ground)), `${mark} on ${ground}`).toBeGreaterThanOrEqual(3);
        expect(Math.max(ratio(ICON.rim, ground), ratio(ICON.halo, ground))).toBeGreaterThanOrEqual(3);
      }
    });

    it('outlines the dots of the hero, the troop and the enemies in the dark, so they read on the pale mountain', () => {
      const { ctx, log } = fakeContext();
      drawMap(ctx, { width: 400, height: 200, centre: [0, 0], unit: 10, round: false }, data({ troop: [[1, 0]], enemies: [[2, 0]] }));
      expect(log.filter((l) => l === 'stroke')).toHaveLength(3);
    });
  });
});

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

describe('groundOffset (#1411)', () => {
  it('undoes screenOffset: the cell offset, in q and r, of a point of the map, at any yaw', () => {
    for (const yaw of [0, 0.7, -2.1]) {
      const { x, y } = screenOffset([0, 0], [3, -5], yaw);
      const [dq, dr] = groundOffset(x, y, yaw);
      expect(dq).toBeCloseTo(3);
      expect(dr).toBeCloseTo(-5);
    }
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

  it('reads a disc of another radius when asked, for the map (#1411)', () => {
    expect(windowCells(() => 'grass', [0, 0], 2)).toHaveLength(19);
  });
});

describe('drawMinimap', () => {
  it('draws an arrow only for the 3 nearest unbeaten lairs out of the window; the others and the beaten ones have none', () => {
    const { ctx, fills } = fakeContext();
    const far = (q: number, beaten = false) => ({ cell: [q, 0] as Axial, beaten });
    drawMinimap(ctx, SIZE, data({ lairs: [far(500), far(60), far(300), far(100), far(40, true), far(200)] }));
    expect(at(fills, COLOURS.lair)).toHaveLength(3);
    expect(at(fills, COLOURS.lairBeaten)).toHaveLength(0);
  });

  it('still draws every lair in the window, whatever the arrows', () => {
    const { ctx, fills } = fakeContext();
    const near = [3, 4, 5, 6].map((q) => ({ cell: [q, 0] as Axial, beaten: false }));
    drawMinimap(ctx, SIZE, data({ lairs: [...near, { cell: [100, 0], beaten: false }] }));
    expect(at(fills, COLOURS.lair)).toHaveLength(5);
  });

  it('clears, clips to a circle and paints each cell in the colour of its terrain', () => {
    const { ctx, log, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ cells: [[3, 0, 'water'], [-3, 0, 'peak']] }));
    expect(log.slice(0, 3)).toEqual(['clear', 'save', 'clip']);
    expect(log).toContain('restore');
    const water = at(fills, terrainColour('water'));
    expect(water).toHaveLength(1);
    expect(water[0]!.at[0]).toBeGreaterThan(MIDDLE);
    expect(at(fills, terrainColour('peak'))[0]!.at[0]).toBeLessThan(MIDDLE);
  });

  it('draws the cells turned with the yaw, so up is up on screen', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ cells: [[-3, 0, 'rock']], yaw: Math.PI / 2 }));
    const [x, y] = at(fills, terrainColour('rock'))[0]!.at;
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

  it('draws a lair in the window as the tower icon of its boss (#1438), a beaten one grey, and the minimap icon is smaller than the map one', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ lairs: [{ cell: [5, 0], beaten: false, boss: 'hull' }, { cell: [-5, 0], beaten: true, boss: 'echo' }] }));
    expect(at(fills, BOSS_COLOURS.hull!)).toHaveLength(1);
    expect(at(fills, ICON.done)).toHaveLength(1);
    expect(at(fills, BOSS_COLOURS.echo!)).toHaveLength(0);
    const span = (points: number[]): number => Math.max(...points.filter((_, i) => i % 2 === 0)) - Math.min(...points.filter((_, i) => i % 2 === 0));
    const small = span(at(fills, BOSS_COLOURS.hull!)[0]!.at);
    const big = fakeContext();
    drawMap(big.ctx, { width: 400, height: 200, centre: [0, 0], unit: 10, round: false }, data({ lairs: [{ cell: [5, 0], beaten: false, boss: 'hull' }] }));
    expect(small).toBeLessThan(span(at(big.fills, BOSS_COLOURS.hull!)[0]!.at));
  });

  it('draws the teleporters given in the window as portal icons (#1412, #1443), none out of it, the hero\'s own lit, and rings the one chosen', () => {
    const { ctx, fills, log } = fakeContext();
    drawMinimap(ctx, SIZE, data({ hero: [3, 0], teleporters: [[3, 0], [-2, 1], [200, 0]] }));
    const drawn = at(fills, ICON.portal);
    expect(drawn).toHaveLength(1); // the core of the one in the window the hero is not on
    expect(drawn[0]!.at).toHaveLength(3); // a disc, not a tower
    expect(drawn[0]!.at[0]).toBeLessThan(MIDDLE); // 5 cells left of the hero, who is in the middle
    expect(at(fills, ICON.here)).toHaveLength(1); // the one the hero stands on
    expect(log).not.toContain('stroke chosen');
    drawMinimap(ctx, SIZE, data({ teleporters: [[3, 0]], chosen: [3, 0] }));
    expect(log).toContain('stroke chosen');
  });

  it('draws a lair out of the window as an arrow on the edge pointing to it', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, SIZE, data({ lairs: [{ cell: [200, 0], beaten: false }, { cell: [100, -200], beaten: false }] }));
    const [right] = at(fills, COLOURS.lair);
    const [x, y] = right!.at;
    expect(x).toBeGreaterThan(MIDDLE + SIZE / 4);
    expect(x).toBeLessThan(SIZE);
    expect(y).toBeCloseTo(MIDDLE);
    expect(right!.at).toHaveLength(6); // a triangle: three points
    const top = at(fills, COLOURS.lair)[1]!;
    expect(top.at[1]).toBeLessThan(MIDDLE - SIZE / 4);
    expect(top.at[0]).toBeCloseTo(MIDDLE);
  });
});

describe('drawMap (#1411): the drawing of the minimap, on a frame of any size, centre and scale', () => {
  const frame = { width: 400, height: 200, centre: [0, 0] as Axial, unit: 10, round: false };

  it('fills the whole rectangle, with no circle, no edge and no arrow: every lair is its tower icon where it is', () => {
    const { ctx, log, fills } = fakeContext();
    drawMap(ctx, frame, data({ lairs: [{ cell: [200, 0], beaten: false, boss: 'hull' }, { cell: [3, 0], beaten: true, boss: 'hull' }] }));
    expect(log).not.toContain('clip');
    expect(at(fills, COLOURS.back)[0]!.at).toEqual([200, 100, 400, 200]);
    const [far] = at(fills, BOSS_COLOURS.hull!);
    expect(far!.at.length).toBeGreaterThan(8); // the crenellated tower, off the canvas
    expect(far!.at[0]).toBeGreaterThan(200 + 200 * 10 - 14);
    expect(far!.at[0]).toBeLessThan(200 + 200 * 10 + 14);
    expect(at(fills, ICON.done)).toHaveLength(1);
  });

  it('draws every teleporter given where it is, however far', () => {
    const { ctx, fills } = fakeContext();
    drawMap(ctx, frame, data({ teleporters: [[200, 0]] }));
    expect(at(fills, ICON.portal)[0]!.at[0]).toBeCloseTo(200 + 200 * 10);
  });

  it('puts the centre in the middle, the cells `unit` px apart, and the hero where it stands', () => {
    const { ctx, fills } = fakeContext();
    drawMap(ctx, { ...frame, centre: [2, 0] }, data({ hero: [0, 0], cells: [[3, 0, 'sand']] }));
    expect(at(fills, terrainColour('sand'))[0]!.at.slice(0, 2)).toEqual([210, 100]);
    expect(at(fills, COLOURS.hero)[0]!.at.slice(0, 2)).toEqual([180, 100]);
  });
});
