// The Open world tools of docs/specs/mcp.md section 5.2: start a world from a seed, read a short window of it, walk a step or to a
// cell. The map, the enemies, the lairs and the path come from the Rust core (`world_chunk`, `world_enemies`, `world_lairs`,
// `world_path`), the same as the client's; this holds the hero, the troop trail (`Hero.step` of client/src/openworld.ts) and the
// cells the hero broke, and turns the engine's codes into words.
import { DIRECTIONS } from './notation';
import type { ErrorCode, Result } from './game';

/** What the Open world uses of abalone-wasm. */
export interface WorldRules {
  /** `[height, terrain, biome]` bytes per cell of a 16 x 16 chunk, empty off the world. */
  world_chunk(seed: number, cx: number, cy: number): Uint8Array;
  /** `q, r` pairs of the enemies that start in a chunk. */
  world_enemies(seed: number, cx: number, cy: number): Int32Array;
  /** `q, r` pairs of the boss lairs, lair 0 first. */
  world_lairs(seed: number): Int32Array;
  /** The walk from a cell to a cell: `q, r` pairs, the start left out, empty when there is none. */
  world_path(seed: number, fromQ: number, fromR: number, toQ: number, toR: number, blocked: Int32Array, broken: Int32Array): Int32Array;
}

type Cell = [q: number, r: number];
export type Direction = (typeof DIRECTIONS)[number];

export interface NewWorldInput {
  seed?: number;
}

export interface WorldStateInput {
  radius?: number;
}

export interface StepInput {
  direction: Direction;
}

export interface WalkInput {
  q: number;
  r: number;
}

export interface Row {
  r: number;
  /** The q of the first cell. */
  q0: number;
  cells: string;
}

export interface WorldState {
  seed: number;
  hero: string;
  troop: string[];
  /** Obstacles the hero has broken. */
  broken: number;
  /** The enemy marbles inside the window. */
  enemies: string[];
  lairs: { boss: string; cell: string; distance: number }[];
  window: { radius: number; rows: Row[] };
}

export interface Stepped {
  moved: boolean;
  /** The obstacle this step broke. */
  smashed: 'boulder' | 'tree' | null;
  /** Set when the step was onto a lair: the hero stays, start the boss fight with `new_game`. */
  lair?: { index: number; boss: string };
  state: WorldState;
}

export interface Walked {
  steps: number;
  state: WorldState;
}

/** Cells of the window in each direction by default, and at most. */
const RADIUS = 3;
/** The search radius of a path, `PATH_RADIUS` of the core, and the troop's length, `TROOP` of the client. */
const PATH_REACH = 40;
const TROOP = 6;
const CHUNK = 16;

/** The terrain codes of the bridge by letter, the window's legend: water, sand, grass, rock, peak, boulder, tree, wall. */
const LETTERS = '~sgrPotW';
const NAMES = ['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall'];
const BOULDER = 5;
const TREE = 6;
const ROCK = 3;
const GRASS = 2;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, message: string): Result<never> => ({ ok: false, error: { code, message } });
const text = ([q, r]: Cell): string => `(${q},${r})`;
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];
const flat = (cells: Cell[]): Int32Array => Int32Array.from(cells.flat());
const hex = (a: Cell, b: Cell): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0] + a[1] - b[1])) / 2;
const toward = (at: Cell, direction: Direction): Cell => {
  const step = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]][DIRECTIONS.indexOf(direction)]!;
  return [at[0] + step[0]!, at[1] + step[1]!];
};

interface Play {
  seed: number;
  hero: Cell;
  troop: Cell[];
  broken: Cell[];
}

/** The one Open world of the server. */
export class OpenWorld {
  private play: Play | null = null;
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly groups = new Map<string, Cell[]>();
  private lairCells: Cell[] = [];

  constructor(
    private readonly rules: WorldRules,
    private readonly bossIds: () => string[],
  ) {}

  /** Starts the world of `seed`, the hero on the spawn and the troop round it, and drops the world in progress. */
  newWorld({ seed = 0 }: NewWorldInput): Result<WorldState> {
    this.chunks.clear();
    this.groups.clear();
    this.lairCells = pairs(this.rules.world_lairs(seed));
    this.play = { seed, hero: [0, 0], troop: [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]], broken: [] };
    return ok(this.view(RADIUS));
  }

  state({ radius = RADIUS }: WorldStateInput): Result<WorldState> {
    return this.play ? ok(this.view(radius)) : this.none();
  }

  /** Rolls the hero one cell. An enemy, a wall, water or a lair in the way refuses it; a boulder, or a tree with no tree beside it, is broken. */
  step({ direction }: StepInput): Result<Stepped> {
    const play = this.play;
    if (!play) return this.none();
    const to = toward(play.hero, direction);
    const lair = this.lairCells.findIndex((cell) => same(cell, to));
    if (lair >= 0) return ok({ moved: false, smashed: null, lair: { index: lair, boss: this.bossIds()[lair]! }, state: this.view(RADIUS) });
    const route = this.route(to);
    if (route.length !== 1) return fail('blocked', `cannot enter ${text(to)}: ${this.reason(to)}`);
    return ok({ moved: true, smashed: this.enter(to), state: this.view(RADIUS) });
  }

  /** Walks the hero to a far cell by the engine's path, round the obstacles and the enemies, up to 40 cells away. */
  walk({ q, r }: WalkInput): Result<Walked> {
    if (!this.play) return this.none();
    const route = this.route([q, r]);
    if (route.length === 0) return fail('no_path', `no way to ${text([q, r])}: it is the hero's cell, a lair, an enemy, off the world, farther than ${PATH_REACH} cells or walled in`);
    for (const cell of route) this.enter(cell);
    return ok({ steps: route.length, state: this.view(RADIUS) });
  }

  private none(): Result<never> {
    return fail('no_world', 'no world started: call new_world first');
  }

  /** The engine's path from the hero to `to`, the enemies and the lairs in the way. */
  private route(to: Cell): Cell[] {
    const { seed, hero, broken } = this.play!;
    const blocked = [...this.enemiesAround(hero, PATH_REACH), ...this.lairCells];
    return pairs(this.rules.world_path(seed, hero[0], hero[1], to[0], to[1], flat(blocked), flat(broken)));
  }

  /** The hero takes `to`, a cell the engine let it enter: the troop trails it, an obstacle on it is broken. */
  private enter(to: Cell): 'boulder' | 'tree' | null {
    const play = this.play!;
    const was = this.terrain(to[0], to[1]);
    const smashed = was === BOULDER || was === TREE ? (NAMES[was] as 'boulder' | 'tree') : null;
    if (smashed) play.broken.push(to);
    play.troop = [play.hero, ...play.troop.filter((cell) => !same(cell, to))].slice(0, TROOP);
    play.hero = to;
    return smashed;
  }

  /** Why the hero cannot enter `to`, in words. */
  private reason(to: Cell): string {
    if (this.enemiesAround(this.play!.hero, 1).some((cell) => same(cell, to))) return 'an enemy stands there';
    const code = this.terrain(to[0], to[1]);
    return code === undefined ? 'off the world' : `${NAMES[code]} in the way`;
  }

  /** The terrain code of a cell with the broken obstacles turned to ground, `undefined` off the world. */
  private terrain(q: number, r: number): number | undefined {
    const [cx, cy] = [Math.floor(q / CHUNK), Math.floor(r / CHUNK)];
    const key = `${cx},${cy}`;
    let cells = this.chunks.get(key);
    if (!cells) this.chunks.set(key, (cells = this.rules.world_chunk(this.play!.seed, cx, cy)));
    const code = cells[((r - cy * CHUNK) * CHUNK + (q - cx * CHUNK)) * 3 + 1];
    if (code === undefined) return undefined;
    // Only a boulder or a tree is ever broken: it is the ground it stood on now (client/src/openworld.ts `LEFT`).
    if (!this.play!.broken.some((cell) => same(cell, [q, r]))) return code;
    return code === BOULDER ? ROCK : GRASS;
  }

  /** The enemy marbles within `radius` cells of `at`. */
  private enemiesAround(at: Cell, radius: number): Cell[] {
    const out: Cell[] = [];
    for (let cy = Math.floor((at[1] - radius) / CHUNK); cy <= Math.floor((at[1] + radius) / CHUNK); cy++) {
      for (let cx = Math.floor((at[0] - radius) / CHUNK); cx <= Math.floor((at[0] + radius) / CHUNK); cx++) {
        const key = `${cx},${cy}`;
        let cells = this.groups.get(key);
        if (!cells) this.groups.set(key, (cells = pairs(this.rules.world_enemies(this.play!.seed, cx, cy))));
        out.push(...cells.filter((cell) => hex(cell, at) <= radius));
      }
    }
    return out;
  }

  private view(radius: number): WorldState {
    const { seed, hero, troop, broken } = this.play!;
    const size = Math.min(Math.max(radius, 1), 8);
    const enemies = this.enemiesAround(hero, size);
    const rows: Row[] = [];
    for (let dr = -size; dr <= size; dr++) {
      const [lo, hi] = [Math.max(-size, -dr - size), Math.min(size, -dr + size)];
      let cells = '';
      for (let dq = lo; dq <= hi; dq++) cells += this.letter([hero[0] + dq, hero[1] + dr], hero, troop, enemies);
      rows.push({ r: hero[1] + dr, q0: hero[0] + lo, cells });
    }
    return {
      seed,
      hero: text(hero),
      troop: troop.map(text),
      broken: broken.length,
      enemies: enemies.map(text),
      lairs: this.lairCells.map((cell, k) => ({ boss: this.bossIds()[k]!, cell: text(cell), distance: hex(hero, cell) })),
      window: { radius: size, rows },
    };
  }

  /** One cell of the window: the hero H, the troop T, an enemy E, a lair L, else its terrain letter, `?` off the world. */
  private letter(cell: Cell, hero: Cell, troop: Cell[], enemies: Cell[]): string {
    if (same(cell, hero)) return 'H';
    if (troop.some((t) => same(t, cell))) return 'T';
    if (enemies.some((e) => same(e, cell))) return 'E';
    if (this.lairCells.some((l) => same(l, cell))) return 'L';
    const code = this.terrain(cell[0], cell[1]);
    return code === undefined ? '?' : LETTERS[code]!;
  }
}

/** The `q, r` pairs of a flat list. */
function pairs(flatList: ArrayLike<number>): Cell[] {
  return Array.from({ length: flatList.length / 2 }, (_, i): Cell => [flatList[2 * i]!, flatList[2 * i + 1]!]);
}

