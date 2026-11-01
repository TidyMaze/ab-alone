import './test/openworldwasm';
import { describe, expect, it, vi } from 'vitest';
import { axialTo3D, type Axial } from './board';
import { BIOMES, CACHE_LIMIT, CHUNK, cellAtPoint, chunkOf, Hero, neighbours, parseChunk, same, SPAWN, TERRAINS, TROOP, World } from './openworld';
import { FightState } from './openworldfight';
import { enter, type Entry } from './openworldstep';

/** A hero on the world with no enemy pushed: the fight is the generated enemies. */
const heroOn = (world: World) => new Hero(world, new FightState());

// A chunk of grass at height 1 with a boulder on (2, 0) and water on (0, 1) of chunk (0, 0); chunk (1, 0) is peaks.
const grass = [1, 2, 0];
function bytes(cx: number, cy: number): Uint8Array {
  if (cx < -1 || cx > 1 || cy < -1 || cy > 1) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set(cx === 1 ? [3, 4, 0] : grass, i * 3);
  if (cx === 0 && cy === 0) {
    out.set([1, 5, 0], 2 * 3); // (2, 0): boulder
    out.set([0, 0, 0], (1 * CHUNK + 0) * 3); // (0, 1): water
  }
  return out;
}

describe('the Open world cells (docs/specs/openworld.md section 2)', () => {
  it('reads the bytes of the bridge, three a cell, by terrain and biome code', () => {
    expect(TERRAINS).toEqual(['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall']);
    expect(BIOMES).toEqual(['meadow', 'forest', 'tundra', 'desert', 'badlands']);
    expect(parseChunk(new Uint8Array([0, 0, 0, 3, 4, 1, 2, 3, 4]))).toEqual([
      { height: 0, terrain: 'water', biome: 'meadow' },
      { height: 3, terrain: 'peak', biome: 'forest' },
      { height: 2, terrain: 'rock', biome: 'badlands' },
    ]);
    expect(parseChunk(new Uint8Array())).toEqual([]);
  });

  it('finds the chunk of a cell, below zero too', () => {
    expect(chunkOf([0, 0])).toEqual([0, 0]);
    expect(chunkOf([15, 16])).toEqual([0, 1]);
    expect(chunkOf([-1, -17])).toEqual([-1, -2]);
  });

  it('loads a chunk the first time one of its cells is asked for, once', () => {
    const asked: string[] = [];
    const world = new World((cx, cy) => (asked.push(`${cx},${cy}`), bytes(cx, cy)));
    expect(world.tile(3, 3)).toEqual({ height: 1, terrain: 'grass', biome: 'meadow' });
    expect(world.tile(4, 4)).toEqual({ height: 1, terrain: 'grass', biome: 'meadow' });
    expect(world.tile(-1, 0)).toEqual({ height: 1, terrain: 'grass', biome: 'meadow' });
    expect(asked).toEqual(['0,0', '-1,0']);
    expect(world.tile(2, 0)).toEqual({ height: 1, terrain: 'boulder', biome: 'meadow' });
    expect(world.tile(CHUNK, 0)).toEqual({ height: 3, terrain: 'peak', biome: 'meadow' });
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
    const hero = heroOn(new World(bytes));
    expect(hero.at).toEqual(SPAWN);
    expect(hero.step([1, 0])).toBe(true);
    expect(hero.at).toEqual([1, 0]);
  });

  it('does not roll two cells, onto water or off the world', () => {
    const hero = heroOn(new World(bytes));
    expect(hero.step([2, 0])).toBe(false); // not a neighbour of the spawn
    const water = heroOn(new World(bytes));
    expect(water.step([0, 1])).toBe(false);
    expect(water.smashed).toBeNull();
    const edge = heroOn(new World(() => new Uint8Array()));
    expect(edge.step([1, 0])).toBe(false); // no tile there
  });

  it('breaks the isolated boulder it rolls into: the move goes through and the cell turns to plain rock (#1147)', () => {
    const world = new World(bytes);
    const hero = heroOn(world);
    hero.step([1, 0]);
    expect(hero.step([2, 0])).toBe(true);
    expect(hero.at).toEqual([2, 0]);
    expect(hero.smashed).toBe('boulder');
    expect(world.tile(2, 0)).toEqual({ height: 1, terrain: 'rock', biome: 'meadow' });
    expect(world.broken).toEqual([[2, 0]]);
    hero.step([1, 0]);
    expect(hero.smashed).toBeNull(); // an ordinary step breaks nothing
  });

  it('does not break an obstacle an enemy stands on', () => {
    const world = new World(bytes);
    const fight = new FightState();
    vi.spyOn(fight, 'occupied').mockReturnValue(true);
    const hero = new Hero(world, fight);
    hero.step([1, 0]);
    expect(hero.step([2, 0])).toBe(false);
    expect(world.tile(2, 0)!.terrain).toBe('boulder');
  });
});

describe('what the hero can break (#1147)', () => {
  // Chunk (0, 0): a lone tree at (5, 5), a grove of two trees at (8, 5) and (9, 5), a wall at (5, 8), a peak at (8, 8), a boulder at (3, 3).
  const cells = (cx: number, cy: number): Uint8Array => {
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) out.set(grass, i * 3);
    if (cx === 0 && cy === 0) {
      for (const [q, r, terrain] of [[5, 5, 6], [8, 5, 6], [9, 5, 6], [5, 8, 7], [8, 8, 4], [3, 3, 5]] as const) out.set([1, terrain, 0], (r * CHUNK + q) * 3);
    }
    return out;
  };
  const world = new World(cells);

  it('is an isolated boulder or an isolated tree, nothing else', () => {
    const fight = new FightState();
    const from = (q: number, r: number): Entry => enter(world, fight, [q - 1, r], [q, r]);
    expect(from(3, 3)).toBe('breaks'); // a boulder
    expect(from(5, 5)).toBe('breaks'); // a tree with no tree beside it
    expect(from(8, 5)).toBe('refused'); // a forest: a tree beside a tree
    expect(from(9, 5)).toBe('refused');
    expect(from(5, 8)).toBe('refused'); // a wall
    expect(from(8, 8)).toBe('refused'); // a peak
    expect(from(1, 1)).toBe('rolls'); // open grass
    expect(enter(new World(() => new Uint8Array()), fight, [0, 0], [1, 0])).toBe('refused'); // off the world
  });

  it('turns an isolated tree to grass when broken, and keeps a forest standing', () => {
    const hero = heroOn(world);
    hero.at = [4, 5];
    expect(hero.step([5, 5])).toBe(true);
    expect(hero.smashed).toBe('tree');
    expect(world.tile(5, 5)!.terrain).toBe('grass');
    hero.at = [7, 5];
    expect(hero.step([8, 5])).toBe(false);
  });

  it('keeps a broken cell broken when its chunk is evicted and loaded again, and when restored on a new world', () => {
    const w = new World(cells);
    w.limit = 1;
    w.smash(3, 3);
    w.chunk(1, 0); // evicts chunk (0, 0)
    expect(w.tile(3, 3)!.terrain).toBe('rock');
    const fresh = new World(cells);
    fresh.restore([[3, 3], [5, 5], [1, 1]]); // a cell with no obstacle (a stale save) stays as it is
    expect(fresh.tile(3, 3)!.terrain).toBe('rock');
    expect(fresh.tile(5, 5)!.terrain).toBe('grass');
    expect(fresh.tile(1, 1)!.terrain).toBe('grass');
    expect(fresh.broken).toEqual([[3, 3], [5, 5], [1, 1]]);
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
    const fight = new FightState();
    expect(fight.occupied(world, 14, 0)).toBe(true);
    expect(fight.occupied(world, 15, 0)).toBe(true);
    expect(fight.occupied(world, 2, 16)).toBe(true);
    expect(fight.occupied(world, 2, 17)).toBe(true);
    expect(fight.occupied(world, 13, 0)).toBe(false);
    expect(fight.occupied(world, 16, 0)).toBe(false); // the next chunk: no group crosses the edge
    expect(fight.occupied(world, 0, 0)).toBe(false);
  });

  it('stop the hero: it does not roll onto a marble', () => {
    const hero = heroOn(new World(bytes, () => Int32Array.of(1, 0)));
    expect(hero.step([1, 0])).toBe(false);
    expect(hero.at).toEqual(SPAWN);
    expect(hero.step([1, -1])).toBe(true);
  });

  it('is stopped by an enemy pushed onto its cell, and free to roll where a pushed enemy stood', () => {
    const world = new World(bytes, () => Int32Array.of(1, 0));
    const fight = new FightState();
    fight.apply([[1, 0]], [[1, -1]], []); // the generated enemy on (1,0) is pushed to (1,-1)
    expect(new Hero(world, fight).step([1, 0])).toBe(true); // its old cell is free
    expect(new Hero(world, fight).step([1, -1])).toBe(false); // its new cell is taken
  });
});

describe('the troop', () => {
  it('starts as six marbles around the spawn', () => {
    const hero = heroOn(new World(bytes));
    expect(TROOP).toBe(6);
    expect(hero.troop).toEqual(neighbours(SPAWN));
  });

  it('trails the hero: the cell it left first, then the cells it left before', () => {
    const hero = heroOn(new World(bytes));
    for (const to of [[1, 0], [1, -1], [1, -2], [1, -3]] as const) expect(hero.step([...to])).toBe(true);
    expect(hero.troop).toHaveLength(TROOP);
    expect(hero.troop.slice(0, 4)).toEqual([[1, -2], [1, -1], [1, 0], SPAWN]);
    expect(new Set(hero.troop.map((c) => c.join(','))).size).toBe(TROOP);
    expect(hero.troop.some((c) => same(c, hero.at))).toBe(false);
  });

  it('keeps six marbles when the hero rolls onto one of them', () => {
    const hero = heroOn(new World(bytes));
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

  it('holds every chunk of the largest view (radius 10: 21 x 21) plus a margin', () => {
    expect(CACHE_LIMIT).toBeGreaterThanOrEqual(21 * 21 + 84); // and the ring of its edge: a rebuild keeps every chunk it uses (#1034)
  });

  it('lets the view raise the limit, the cache follows it', () => {
    const world = new World((cx: number, cy: number) => bytes(cx, cy));
    world.limit = 400;
    for (let cx = 0; cx < 350; cx++) world.chunk(cx, 0);
    expect(world.cached.chunks).toBe(350);
  });

  it('a tile read finds its chunk without loading it again, and does not move it in the cache (#1034)', () => {
    const load = vi.fn((cx: number, cy: number) => bytes(cx, cy));
    const world = new World(load);
    world.limit = 2;
    world.chunk(0, 0);
    world.chunk(1, 0);
    world.tile(0, 0); // found, not loaded again; not moved to the most recent place
    world.chunk(2, 0); // evicts the least recently used: (0, 0), not (1, 0)
    const loads = (cx: number, cy: number) => load.mock.calls.filter(([x, y]) => x === cx && y === cy).length;
    expect(loads(0, 0)).toBe(1);
    world.chunk(1, 0);
    expect(loads(1, 0)).toBe(1);
    world.chunk(0, 0);
    expect(loads(0, 0)).toBe(2);
  });

  it('evicts the least recently used chunk; a chunk read again stays', () => {
    const load = vi.fn((cx: number, cy: number) => bytes(cx, cy));
    const world = new World(load);
    world.chunk(0, 0);
    for (let cx = 2; cx < 2 + CACHE_LIMIT - 2; cx++) world.chunk(cx, 0);
    world.chunk(0, 0); // read again: now the most recently used
    world.chunk(1000, 0); // full
    world.chunk(1001, 0); // evicts the oldest, (2, 0)
    const loads = (cx: number, cy: number) => load.mock.calls.filter(([x, y]) => x === cx && y === cy).length;
    expect(loads(0, 0)).toBe(1);
    expect(loads(2, 0)).toBe(1);
    world.chunk(2, 0);
    expect(loads(2, 0)).toBe(2);
  });
});
