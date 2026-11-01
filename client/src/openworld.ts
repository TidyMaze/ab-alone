// The Open world mode (docs/specs/openworld.md): the cells of a huge generated map, read lazily from the engine one chunk
// at a time, and the hero that walks them one cell at a time. Pure data and rules: no DOM, no three.js.
import { DIRECTIONS, type Axial } from './board';
import type { FightState } from './openworldfight';
import { enter, trail } from './openworldstep';

/** A chunk is CHUNK x CHUNK cells; the world is WORLD_CHUNKS x WORLD_CHUNKS chunks centred on the spawn. */
export const CHUNK = 16;
export const WORLD_CHUNKS = 64;
export const SPAWN: Axial = [0, 0];

/** The terrain codes of the bridge (`world_chunk`), by code. */
export const TERRAINS = ['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall'] as const;
export type Terrain = (typeof TERRAINS)[number];
/** The biome codes of the bridge (`world_chunk`), by code: the order of `Biome` in the engine (openworld-terrain.md section 4). */
export const BIOMES = ['meadow', 'forest', 'tundra', 'desert', 'badlands'] as const;
export type Biome = (typeof BIOMES)[number];
export interface Tile {
  height: number;
  terrain: Terrain;
  biome: Biome;
}

/** What a broken obstacle leaves: the plain ground it stood on (#1147). */
const LEFT: Partial<Record<Terrain, Terrain>> = { boulder: 'rock', tree: 'grass' };

/** The chunk a cell is in. */
export const chunkOf = ([q, r]: Axial): Axial => [Math.floor(q / CHUNK), Math.floor(r / CHUNK)];

/** The tiles of a chunk the bridge returned, three bytes a cell (height, terrain, biome) row by row, `[]` off the world. */
export function parseChunk(bytes: Uint8Array): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    tiles.push({ height: bytes[i]!, terrain: TERRAINS[bytes[i + 1]!]!, biome: BIOMES[bytes[i + 2]!]! });
  }
  return tiles;
}

/** Chunks and enemy lists kept at once: the square of 21 x 21 chunks the largest view (radius 10) draws (441), plus the ring of
 * up to 84 chunks outside it that the water of its edge reads (`waterColor`), 525 in all, and a margin. Below that a rebuild evicts
 * chunks it has just used and loads them again (#1034). The least recently used go first; `World.limit` can be raised. */
export const CACHE_LIMIT = 640;

/** The key of a chunk in the caches: a number, cheap to make on every tile read. The chunks of a world are within 32k of the spawn,
 * so no two chunks share a key. */
const keyOf = (cx: number, cy: number): number => cx * 65536 + cy;

/** The value of a key, kept the most recently used; `undefined` when absent. */
function touch<T>(cache: Map<number, T>, key: number): T | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

/** Stores a value as the most recently used, dropping the least recently used beyond `limit`. */
function remember<T>(cache: Map<number, T>, key: number, value: T, limit: number): void {
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value as number);
}

/** The world of a seed: chunks come from `load(cx, cy)` the first time a cell of them is asked for. */
export class World {
  private readonly chunks = new Map<number, Tile[]>();
  private readonly groups = new Map<number, Axial[]>();
  /** The cells the hero has broken, by chunk: applied on top of a chunk each time it is read from the engine (#1147). */
  private readonly smashed = new Map<number, Axial[]>();
  /** How many chunks, and how many enemy lists, are kept at once. */
  limit = CACHE_LIMIT;
  /** How many chunks and enemy lists are cached now. */
  get cached(): { chunks: number; enemies: number } {
    return { chunks: this.chunks.size, enemies: this.groups.size };
  }
  /** `loadEnemies(cx, cy)` gives the enemy marbles that start in a chunk, `q, r` pairs. */
  constructor(
    private readonly load: (cx: number, cy: number) => Uint8Array,
    private readonly loadEnemies: (cx: number, cy: number) => Int32Array = () => new Int32Array(),
  ) {}

  /** The chunk `(cx, cy)`, `[]` off the world. */
  chunk(cx: number, cy: number): readonly Tile[] {
    const key = keyOf(cx, cy);
    let tiles = touch(this.chunks, key);
    if (!tiles) {
      tiles = parseChunk(this.load(cx, cy));
      for (const [q, r] of this.smashed.get(key) ?? []) this.leave(tiles, q, r);
      remember(this.chunks, key, tiles, this.limit);
    }
    return tiles;
  }

  /** The tile of a cell in `tiles` (its chunk) turns to the ground its obstacle stood on. */
  private leave(tiles: Tile[], q: number, r: number): void {
    const [cx, cy] = chunkOf([q, r]);
    const tile = tiles[(r - cy * CHUNK) * CHUNK + (q - cx * CHUNK)]!;
    tile.terrain = LEFT[tile.terrain] ?? tile.terrain;
  }

  /** Breaks the obstacle on a cell for good: the cell is plain ground now, and stays so when its chunk is read again (#1147). */
  smash(q: number, r: number): void {
    this.restore([[q, r]]);
  }

  /** Breaks the cells given, as a saved world kept them. Call it before the cells are read; a chunk already read is changed too. */
  restore(cells: readonly Axial[]): void {
    for (const [q, r] of cells) {
      const key = keyOf(...chunkOf([q, r]));
      this.smashed.set(key, [...(this.smashed.get(key) ?? []), [q, r]]);
      const tiles = this.chunks.get(key);
      if (tiles) this.leave(tiles, q, r);
    }
  }

  /** Every cell broken so far, for the save. */
  get broken(): Axial[] {
    return [...this.smashed.values()].flat();
  }

  /** The enemy marbles that start in the chunk `(cx, cy)`. */
  enemies(cx: number, cy: number): readonly Axial[] {
    const key = keyOf(cx, cy);
    let cells = touch(this.groups, key);
    if (!cells) {
      const flat = this.loadEnemies(cx, cy);
      cells = Array.from({ length: flat.length / 2 }, (_, i): Axial => [flat[2 * i]!, flat[2 * i + 1]!]);
      remember(this.groups, key, cells, this.limit);
    }
    return cells;
  }

  /** The tile of a cell, `undefined` off the world. A read finds its chunk without moving it in the cache: the view reads the six
   * neighbours of every water cell, and the chunks it draws are touched by `chunk` (#1034). */
  tile(q: number, r: number): Tile | undefined {
    const [cx, cy] = chunkOf([q, r]);
    const tiles = this.chunks.get(keyOf(cx, cy)) ?? this.chunk(cx, cy);
    return tiles[(r - cy * CHUNK) * CHUNK + (q - cx * CHUNK)];
  }
}

/** Whether two cells are the same. */
export const same = (a: Axial, b: Axial): boolean => a[0] === b[0] && a[1] === b[1];

/** The cells next to a cell, in the order of the board directions. */
export const neighbours = ([q, r]: Axial): Axial[] => DIRECTIONS.map(([dq, dr]): Axial => [q + dq, r + dr]);

/** The cell nearest to a point of the ground plane, from the pointy-top layout of `axialTo3D`. */
export function cellAtPoint(x: number, z: number): Axial {
  const r = z / (Math.sqrt(3) / 2);
  const q = x - r / 2;
  // Cube rounding: the axis that rounded furthest is rebuilt from the other two.
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq + 0, rr + 0]; // + 0: no -0
}

/** The troop follows the hero: this many marbles. */
export const TROOP = 6;

/** The hero: one marble that rolls one cell at a time over the open cells of the world, and the troop that trails it. */
export class Hero {
  at: Axial = SPAWN;
  /** The troop starts around the spawn; after a step each marble takes the place of the one before it, the first the hero's. */
  troop: Axial[] = neighbours(SPAWN);
  /** The obstacle the last step broke (#1147), `null` when it broke none. */
  smashed: Terrain | null = null;
  /** `fight` holds the enemies as they are now, the pushed ones included (openworldfight.ts). */
  constructor(
    private readonly world: World,
    private readonly fight: FightState,
  ) {}

  /** Rolls to `to` when the engine allows the step (`enter`, abalone-core `worldstep`: a neighbour that is on the world, free of enemies and
   * either open or an obstacle it breaks, #1147); reports whether it moved. */
  step(to: Axial): boolean {
    this.smashed = null;
    const entry = enter(this.world, this.fight, this.at, to);
    if (entry === 'refused') return false;
    if (entry === 'breaks') {
      this.smashed = this.world.tile(to[0], to[1])!.terrain;
      this.world.smash(to[0], to[1]);
    }
    this.troop = trail(this.troop, this.at, to);
    this.at = to;
    return true;
  }
}
