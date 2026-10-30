import { describe, expect, it, vi } from 'vitest';
import { axialTo3D, type Axial } from './board';
import { blocked, CACHE_LIMIT, CHUNK, cellAtPoint, chunkOf, Hero, neighbours, parseChunk, same, SPAWN, TERRAINS, TROOP, World } from './openworld';

// A chunk of grass at height 1 with a boulder on (2, 0) and water on (0, 1) of chunk (0, 0); chunk (1, 0) is peaks.
const grass = [1, 2];
function bytes(cx: number, cy: number): Uint8Array {
  if (cx < -1 || cx > 1 || cy < -1 || cy > 1) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set(cx === 1 ? [3, 4] : grass, i * 2);
  if (cx === 0 && cy === 0) {
    out.set([1, 5], 2 * 2); // (2, 0): boulder
    out.set([0, 0], (1 * CHUNK + 0) * 2); // (0, 1): water
  }
  return out;
}

describe('the Open world cells (docs/specs/openworld.md section 2)', () => {
  it('reads the bytes of the bridge, two a cell, by terrain code', () => {
    expect(TERRAINS).toEqual(['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall']);
    expect(parseChunk(new Uint8Array([0, 0, 3, 4, 2, 3]))).toEqual([
      { height: 0, terrain: 'water' },
      { height: 3, terrain: 'peak' },
      { height: 2, terrain: 'rock' },
    ]);
    expect(parseChunk(new Uint8Array())).toEqual([]);
  });

  it('blocks water, peaks, boulders, trees and walls only', () => {
    const blockedBy = TERRAINS.filter((terrain) => blocked({ height: 1, terrain }));
    expect(blockedBy).toEqual(['water', 'peak', 'boulder', 'tree', 'wall']);
  });

  it('finds the chunk of a cell, below zero too', () => {
    expect(chunkOf([0, 0])).toEqual([0, 0]);
    expect(chunkOf([15, 16])).toEqual([0, 1]);
    expect(chunkOf([-1, -17])).toEqual([-1, -2]);
  });

  it('loads a chunk the first time one of its cells is asked for, once', () => {
    const asked: string[] = [];
    const world = new World((cx, cy) => (asked.push(`${cx},${cy}`), bytes(cx, cy)));
    expect(world.tile(3, 3)).toEqual({ height: 1, terrain: 'grass' });
    expect(world.tile(4, 4)).toEqual({ height: 1, terrain: 'grass' });
    expect(world.tile(-1, 0)).toEqual({ height: 1, terrain: 'grass' });
    expect(asked).toEqual(['0,0', '-1,0']);
    expect(world.tile(2, 0)).toEqual({ height: 1, terrain: 'boulder' });
    expect(world.tile(CHUNK, 0)).toEqual({ height: 3, terrain: 'peak' });
  });

  it('has no tile off the world', () => {
    const world = new World(bytes);
    expect(world.tile(5 * CHUNK, 0)).toBeUndefined();
    expect(world.chunk(9, 9)).toEqual([]);
  });

  it('knows the six neighbours and when two cells are the same', () => {
    expect(neighbours([0, 0])).toHaveLength(6);
    expect(neighbours([2, -1]).every((n) => Math.abs(n[0] - 2) + Math.abs(n[1] + 1) <= 2)).toBe(true);
    expect(same([1, 2], [1, 2])).toBe(true);
    expect(same([1, 2], [2, 1])).toBe(false);
  });

  it('turns a point of the ground back into the cell drawn there', () => {
    for (const [q, r] of [[0, 0], [3, -2], [-4, 5], [7, 7], [-6, -1]] as Axial[]) {
      const p = axialTo3D(q, r);
      expect(cellAtPoint(p.x, p.z)).toEqual([q, r]);
      expect(cellAtPoint(p.x + 0.2, p.z + 0.1)).toEqual([q, r]); // inside the hex
    }
    expect(cellAtPoint(0.01, 0.01)).toEqual([0, 0]);
    // The three ways the cube rounding goes: q, r, then s rounds furthest. All three points are inside the spawn hex.
    expect(cellAtPoint(0.3, -0.1732)).toEqual([0, 0]);
    expect(cellAtPoint(0.125, 0.3897)).toEqual([0, 0]);
    expect(cellAtPoint(0.45, 0.26)).toEqual([0, 0]);
  });
});

describe('the hero', () => {
  it('starts at the spawn and rolls onto a neighbour that is open', () => {
    const hero = new Hero(new World(bytes));
    expect(hero.at).toEqual(SPAWN);
    expect(hero.step([1, 0])).toBe(true);
    expect(hero.at).toEqual([1, 0]);
  });

  it('does not roll two cells, onto a boulder, onto water or off the world', () => {
    const hero = new Hero(new World(bytes));
    expect(hero.step([2, 0])).toBe(false); // not a neighbour of the spawn
    hero.step([1, 0]);
    expect(hero.step([2, 0])).toBe(false); // a boulder
    expect(hero.at).toEqual([1, 0]);
    const water = new Hero(new World(bytes));
    expect(water.step([0, 1])).toBe(false);
    const edge = new Hero(new World(() => new Uint8Array()));
    expect(edge.step([1, 0])).toBe(false); // no tile there
  });
});

// Enemy marbles: a group of two at the end of chunk (0, 0), a group of two in chunk (0, 1). Groups never leave their chunk.
const foes = (cx: number, cy: number): Int32Array =>
  cx === 0 && cy === 0 ? Int32Array.of(14, 0, 15, 0) : cx === 0 && cy === 1 ? Int32Array.of(2, 16, 2, 17) : new Int32Array();

describe('the enemies', () => {
  it('reads the marbles of a chunk as cells, once', () => {
    const load = vi.fn(foes);
    const world = new World(bytes, load);
    expect(world.enemies(0, 0)).toEqual([[14, 0], [15, 0]]);
    expect(world.enemies(0, 0)).toBe(world.enemies(0, 0));
    expect(load).toHaveBeenCalledTimes(1);
    expect(new World(bytes).enemies(0, 0)).toEqual([]);
  });

  it('finds a marble on its cell, in the chunk of that cell only', () => {
    const world = new World(bytes, foes);
    expect(world.occupied(14, 0)).toBe(true);
    expect(world.occupied(15, 0)).toBe(true);
    expect(world.occupied(2, 16)).toBe(true);
    expect(world.occupied(2, 17)).toBe(true);
    expect(world.occupied(13, 0)).toBe(false);
    expect(world.occupied(16, 0)).toBe(false); // the next chunk: no group crosses the edge
    expect(world.occupied(0, 0)).toBe(false);
  });

  it('stop the hero: it does not roll onto a marble', () => {
    const hero = new Hero(new World(bytes, () => Int32Array.of(1, 0)));
    expect(hero.step([1, 0])).toBe(false);
    expect(hero.at).toEqual(SPAWN);
    expect(hero.step([1, -1])).toBe(true);
  });
});

describe('the troop', () => {
  it('starts as six marbles around the spawn', () => {
    const hero = new Hero(new World(bytes));
    expect(TROOP).toBe(6);
    expect(hero.troop).toEqual(neighbours(SPAWN));
  });

  it('trails the hero: the cell it left first, then the cells it left before', () => {
    const hero = new Hero(new World(bytes));
    for (const to of [[1, 0], [1, -1], [1, -2], [1, -3]] as const) expect(hero.step([...to])).toBe(true);
    expect(hero.troop).toHaveLength(TROOP);
    expect(hero.troop.slice(0, 4)).toEqual([[1, -2], [1, -1], [1, 0], SPAWN]);
    expect(new Set(hero.troop.map((c) => c.join(','))).size).toBe(TROOP);
    expect(hero.troop.some((c) => same(c, hero.at))).toBe(false);
  });

  it('keeps six marbles when the hero rolls onto one of them', () => {
    const hero = new Hero(new World(bytes));
    const onto = hero.troop[0]!;
    expect(hero.step(onto)).toBe(true);
    expect(hero.troop).toHaveLength(TROOP);
    expect(hero.troop.some((c) => same(c, onto))).toBe(false);
    expect(hero.troop[0]).toEqual(SPAWN);
  });
});

describe('the Open world cache is bounded (#981)', () => {
  it('keeps at most CACHE_LIMIT chunks and enemy lists and reloads an evicted chunk identically', () => {
    const load = vi.fn((cx: number, cy: number) => bytes(cx, cy));
    const loadEnemies = vi.fn((_cx: number, _cy: number) => new Int32Array([1, 2, 3, 4]));
    const world = new World(load, loadEnemies);
    const first = [...world.chunk(0, 0)];
    const firstGroups = [...world.enemies(0, 0)];
    for (let cx = -200; cx <= 200; cx++) {
      for (let cy = -2; cy < 2; cy++) {
        world.chunk(cx, cy);
        world.enemies(cx, cy);
        expect(world.cached.chunks).toBeLessThanOrEqual(CACHE_LIMIT);
        expect(world.cached.enemies).toBeLessThanOrEqual(CACHE_LIMIT);
      }
    }
    expect(world.cached).toEqual({ chunks: CACHE_LIMIT, enemies: CACHE_LIMIT });
    expect(world.chunk(0, 0)).toEqual(first);
    expect(world.enemies(0, 0)).toEqual(firstGroups);
    // Loaded at first, again in the walk (it was evicted by then) and again after the walk.
    expect(load.mock.calls.filter(([cx, cy]) => cx === 0 && cy === 0)).toHaveLength(3);
    expect(loadEnemies.mock.calls.filter(([cx, cy]) => cx === 0 && cy === 0)).toHaveLength(3);
  });

  it('lets the view raise the limit, the cache follows it', () => {
    const world = new World((cx: number, cy: number) => bytes(cx, cy));
    world.limit = 400;
    for (let cx = 0; cx < 350; cx++) world.chunk(cx, 0);
    expect(world.cached.chunks).toBe(350);
  });

  it('evicts the least recently used chunk; a chunk read again stays', () => {
    const load = vi.fn((cx: number, cy: number) => bytes(cx, cy));
    const world = new World(load);
    world.chunk(0, 0);
    for (let cx = 2; cx < 2 + CACHE_LIMIT - 2; cx++) world.chunk(cx, 0);
    world.chunk(0, 0); // read again: now the most recently used
    world.chunk(100, 0); // full: 64 chunks
    world.chunk(101, 0); // evicts the oldest, (2, 0)
    const loads = (cx: number, cy: number) => load.mock.calls.filter(([x, y]) => x === cx && y === cy).length;
    expect(loads(0, 0)).toBe(1);
    expect(loads(2, 0)).toBe(1);
    world.chunk(2, 0);
    expect(loads(2, 0)).toBe(2);
  });
});
