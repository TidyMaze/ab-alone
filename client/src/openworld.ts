// The Open world mode (docs/specs/openworld.md): the cells of a huge generated map, read lazily from the engine one chunk
// at a time, and the hero that walks them one cell at a time. Pure data and rules: no DOM, no three.js.
import { DIRECTIONS, type Axial } from './board';

/** A chunk is CHUNK x CHUNK cells; the world is WORLD_CHUNKS x WORLD_CHUNKS chunks centred on the spawn. */
export const CHUNK = 16;
export const WORLD_CHUNKS = 64;
export const SPAWN: Axial = [0, 0];

/** The terrain codes of the bridge (`world_chunk`), by code. */
export const TERRAINS = ['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall'] as const;
export type Terrain = (typeof TERRAINS)[number];
/** The terrains a marble cannot enter. */
const BLOCKED: ReadonlySet<Terrain> = new Set(['water', 'peak', 'boulder', 'tree', 'wall']);

export interface Tile {
  height: number;
  terrain: Terrain;
}

export const blocked = (tile: Tile): boolean => BLOCKED.has(tile.terrain);

/** The chunk a cell is in. */
export const chunkOf = ([q, r]: Axial): Axial => [Math.floor(q / CHUNK), Math.floor(r / CHUNK)];

/** The tiles of a chunk the bridge returned, row by row, `[]` off the world. */
export function parseChunk(bytes: Uint8Array): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < bytes.length; i += 2) tiles.push({ height: bytes[i]!, terrain: TERRAINS[bytes[i + 1]!]! });
  return tiles;
}

/** The world of a seed: chunks come from `load(cx, cy)` the first time a cell of them is asked for. */
export class World {
  private readonly chunks = new Map<string, Tile[]>();
  private readonly groups = new Map<string, Axial[]>();
  /** `loadEnemies(cx, cy)` gives the enemy marbles that start in a chunk, `q, r` pairs. */
  constructor(
    private readonly load: (cx: number, cy: number) => Uint8Array,
    private readonly loadEnemies: (cx: number, cy: number) => Int32Array = () => new Int32Array(),
  ) {}

  /** The chunk `(cx, cy)`, `[]` off the world. */
  chunk(cx: number, cy: number): readonly Tile[] {
    const key = `${cx},${cy}`;
    let tiles = this.chunks.get(key);
    if (!tiles) {
      tiles = parseChunk(this.load(cx, cy));
      this.chunks.set(key, tiles);
    }
    return tiles;
  }

  /** The enemy marbles that start in the chunk `(cx, cy)`. */
  enemies(cx: number, cy: number): readonly Axial[] {
    const key = `${cx},${cy}`;
    let cells = this.groups.get(key);
    if (!cells) {
      const flat = this.loadEnemies(cx, cy);
      cells = Array.from({ length: flat.length / 2 }, (_, i): Axial => [flat[2 * i]!, flat[2 * i + 1]!]);
      this.groups.set(key, cells);
    }
    return cells;
  }

  /** Whether an enemy marble stands on a cell. A group never leaves the chunk it starts in, so only the cell's own chunk is read. */
  occupied(q: number, r: number): boolean {
    return this.enemies(...chunkOf([q, r])).some((e) => e[0] === q && e[1] === r);
  }

  /** The tile of a cell, `undefined` off the world. */
  tile(q: number, r: number): Tile | undefined {
    const [cx, cy] = chunkOf([q, r]);
    return this.chunk(cx, cy)[(r - cy * CHUNK) * CHUNK + (q - cx * CHUNK)];
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
  constructor(private readonly world: World) {}

  /** Rolls to `to` when it is a neighbour that is on the world, not blocked and free of enemies; reports whether it moved. */
  step(to: Axial): boolean {
    if (!neighbours(this.at).some((n) => same(n, to))) return false;
    const tile = this.world.tile(to[0], to[1]);
    if (!tile || blocked(tile) || this.world.occupied(to[0], to[1])) return false;
    this.troop = [this.at, ...this.troop.filter((c) => !same(c, to))].slice(0, TROOP);
    this.at = to;
    return true;
  }
}
