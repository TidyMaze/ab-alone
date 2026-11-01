// The Open world tools of docs/specs/mcp.md section 5: start a world from a seed, read a short window of it, walk a step or to a
// cell. Every rule is the Rust core's, called in the client's order (`OpenWorldMode.roll` of client/src/openworldmode.ts): the map,
// the enemies, the lairs and the path (`world_chunk`, `world_enemies`, `world_lairs`, `world_path`), the step (`world_enter`,
// `world_trail`) and the troop's push after it (`WorldFight`). This holds the hero, the troop, the broken cells, the fight and the lairs
// beaten, saves them in the client's format (client/src/openworldsave.ts), and turns the engine's codes into words.
import { endingLine } from '../../client/src/tally';
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
  /** What the step from `(q, r)` to `(tq, tr)` does: 0 refused, 1 rolls, 2 breaks. `terrain` is the code of the cell, -1 off the world. */
  world_enter(q: number, r: number, tq: number, tr: number, terrain: number, occupied: boolean, treesNear: boolean): number;
  /** The troop after the hero steps from `(q, r)` to `(tq, tr)`: `q, r` pairs. */
  world_trail(troop: Int32Array, q: number, r: number, tq: number, tr: number): Int32Array;
  /** The version of the world generator: a save of another version does not hold this world. */
  world_version(): number;
  /** The enemies of a fight as the pushes left them: a new one has no push, `restore` gives the fight of a save. */
  WorldFight: { new (): Fight; restore(removed: Int32Array, added: Int32Array, beaten: number): Fight; push_reach(): number };
}

/** What the Open world uses of the bridge's `WorldFight` (abalone-core `worldoverlay`). */
export interface Fight {
  occupied(generated: Int32Array, q: number, r: number): boolean;
  around(chunks: Int32Array, q: number, r: number, radius: number): Int32Array;
  troop_push(seed: number, troop: Int32Array, chunks: Int32Array, broken: Int32Array): { troop: Int32Array; ejected: Int32Array; dir: Int32Array } | undefined;
  removed(): Int32Array;
  added(): Int32Array;
  beaten(): number;
}

/** The game of the session, as the lairs read it: its id, and the boss of a local boss fight the agent won, else `null`. */
export interface Outcome {
  game: string;
  boss: string | null;
}

type Cell = [q: number, r: number];
export type Direction = (typeof DIRECTIONS)[number];

/** A world as the client saves it (`worldSaves().put` of client/src/openworldsave.ts, record 3), cells as `[q, r]`. */
export interface WorldSave {
  record?: number;
  version: number;
  seed: number;
  hero: Cell;
  troop: Cell[];
  /** The enemies the pushes moved: the generated ones gone (`"q,r"`), the ones on other cells, the number ejected. */
  fight: { removed: string[]; added: Cell[]; beaten: number };
  /** The camera's turn in the client, kept as it was. */
  yaw: number;
  broken: Cell[];
  /** The numbers of the lairs beaten. */
  lairs: number[];
  savedAt?: number;
}

export interface NewWorldInput {
  seed?: number;
  /** Resume this save instead, its seed included. */
  save?: WorldSave;
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
  /** Enemy marbles the troop has ejected. */
  beaten: number;
  /** The enemy marbles inside the window. */
  enemies: string[];
  lairs: { boss: string; cell: string; distance: number; beaten: boolean }[];
  /** Tally's line of the client once every lair is beaten (#1175), the world's end; absent before. */
  ending?: string;
  window: { radius: number; rows: Row[] };
}

/** The troop's push after a step: its direction and the enemy it ejected, none or one. */
export interface Push {
  direction: Direction;
  ejected: string[];
}

export interface Stepped {
  moved: boolean;
  /** The obstacle this step broke. */
  smashed: 'boulder' | 'tree' | null;
  /** The push the troop made after the step, `null` when none was legal. */
  push: Push | null;
  /** Set when the step was onto a lair: the hero stays, start the boss fight with `new_game`. */
  lair?: { index: number; boss: string; start: string };
  state: WorldState;
}

export interface Walked {
  steps: number;
  /** The pushes the troop made on the way. */
  pushes: Push[];
  state: WorldState;
}

/** Cells of the window in each direction by default, and at most. */
const RADIUS = 3;
/** The search radius of a path, `PATH_REACH` of the client. */
const PATH_REACH = 40;
const CHUNK = 16;
/** The step of each direction, in the order of `DIRECTIONS`. */
const DELTAS: Cell[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];

/** The terrain codes of the bridge by letter, the window's legend: water, sand, grass, rock, peak, boulder, tree, wall. */
const LETTERS = '~sgrPotW';
const NAMES = ['water', 'sand', 'grass', 'rock', 'peak', 'boulder', 'tree', 'wall'];
/** The record of the client's save (`RECORD` of client/src/openworldsave.ts) and the crew of its ending line (`MARBLES` of
 * client/src/trainer.ts). */
const RECORD = 3;
const CREW = 6;
const BOULDER = 5;
const TREE = 6;
const ROCK = 3;
const GRASS = 2;
/** The answers of `world_enter`. */
const REFUSED = 0;
const BREAKS = 2;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, message: string): Result<never> => ({ ok: false, error: { code, message } });
const text = ([q, r]: Cell): string => `(${q},${r})`;
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];
const flat = (cells: Cell[]): Int32Array => Int32Array.from(cells.flat());
const hex = (a: Cell, b: Cell): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0] + a[1] - b[1])) / 2;
const toward = (at: Cell, direction: Direction): Cell => {
  const step = DELTAS[DIRECTIONS.indexOf(direction)]!;
  return [at[0] + step[0], at[1] + step[1]];
};

interface Play {
  seed: number;
  hero: Cell;
  troop: Cell[];
  broken: Cell[];
  fight: Fight;
  lairs: number[];
  yaw: number;
}

/** The one Open world of the server. */
export class OpenWorld {
  private play: Play | null = null;
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly groups = new Map<string, Cell[]>();
  private lairCells: Cell[] = [];
  /** The lair the hero last stepped onto, its boss and the session's game then: a fight of that boss won since beats the lair. */
  private entered: { lair: number; boss: string; before: string | null } | null = null;

  constructor(
    private readonly rules: WorldRules,
    private readonly bossIds: () => string[],
    private readonly games: { outcome(): Outcome | null } = { outcome: () => null },
  ) {}

  /** Starts the world of `seed`, the hero on the spawn and the troop round it, no push yet, or resumes `save`, and drops the world in
   * progress. A save of another world version is refused and the world in progress kept. */
  newWorld({ seed = 0, save }: NewWorldInput): Result<WorldState> {
    const version = this.rules.world_version();
    if (save && save.version !== version) return fail('bad_save', `the save is of world version ${save.version}, this world is version ${version}: start a new world`);
    this.chunks.clear();
    this.groups.clear();
    this.entered = null;
    if (save) {
      const { removed, added, beaten } = save.fight;
      const fight = this.rules.WorldFight.restore(Int32Array.from(removed.flatMap((key) => key.split(',').map(Number))), flat(added), beaten);
      this.play = { seed: save.seed, hero: save.hero, troop: save.troop, broken: [...save.broken], fight, lairs: [...save.lairs], yaw: save.yaw };
    } else {
      this.play = { seed, hero: [0, 0], troop: [...DELTAS], broken: [], fight: new this.rules.WorldFight(), lairs: [], yaw: 0 };
    }
    this.lairCells = pairs(this.rules.world_lairs(this.play.seed));
    return ok(this.view(RADIUS));
  }

  state({ radius = RADIUS }: WorldStateInput): Result<WorldState> {
    if (!this.play) return this.none();
    this.back();
    return ok(this.view(radius));
  }

  /** The world in the client's save format: `new_world` with it, or the client, resumes it. */
  save(): Result<WorldSave> {
    const play = this.play;
    if (!play) return this.none();
    this.back();
    const { seed, hero, troop, broken, fight, lairs, yaw } = play;
    const removed = pairs(fight.removed()).map(([q, r]) => `${q},${r}`);
    return ok({ record: RECORD, version: this.rules.world_version(), seed, hero, troop, fight: { removed, added: pairs(fight.added()), beaten: fight.beaten() }, yaw, broken: [...broken], lairs: [...lairs], savedAt: Date.now() });
  }

  /** Rolls the hero one cell, then the troop pushes. An enemy, a wall, water or a tree beside a tree refuses it; a boulder, or a tree
   * with no tree beside it, is broken. Onto a lair the hero stays and the lair's boss is named, where the client starts its fight. */
  step({ direction }: StepInput): Result<Stepped> {
    const play = this.play;
    if (!play) return this.none();
    this.back();
    const to = toward(play.hero, direction);
    const lair = this.lairCells.findIndex((cell) => same(cell, to));
    if (lair >= 0) {
      const boss = this.bossOf(lair);
      this.entered = { lair, boss, before: this.games.outcome()?.game ?? null };
      return ok({ moved: false, smashed: null, push: null, lair: { index: lair, boss, start: `new_game ${JSON.stringify({ boss })}` }, state: this.view(RADIUS) });
    }
    const rolled = this.roll(to);
    if (!rolled) return fail('blocked', `cannot enter ${text(to)}: ${this.reason(to)}`);
    return ok({ moved: true, ...rolled, state: this.view(RADIUS) });
  }

  /** Walks the hero to a far cell by the engine's path, round the obstacles and the enemies, up to 40 cells away, one step at a time
   * as the client's walk: the troop pushes after each step, and a step a push made impossible ends the walk there. */
  walk({ q, r }: WalkInput): Result<Walked> {
    if (!this.play) return this.none();
    this.back();
    const route = this.route([q, r]);
    if (route.length === 0) return fail('no_path', `no way to ${text([q, r])}: it is the hero's cell, a lair, an enemy, off the world, farther than ${PATH_REACH} cells or walled in`);
    const pushes: Push[] = [];
    let steps = 0;
    for (const cell of route) {
      const rolled = this.roll(cell);
      if (!rolled) break;
      steps++;
      if (rolled.push) pushes.push(rolled.push);
    }
    return ok({ steps, pushes, state: this.view(RADIUS) });
  }

  /** The boss of lair `k`: boss `k` of the roster, round it, as the client's (client/src/main.ts). */
  private bossOf(k: number): string {
    const ids = this.bossIds();
    return ids[k % ids.length]!;
  }

  /** The agent is back in the world (the client's "Back to the Open world", #1170): a fight of the lair's boss started after the step
   * onto the lair and won beats that lair. */
  private back(): void {
    const entered = this.entered;
    if (!entered) return;
    const now = this.games.outcome();
    if (!now || now.game === entered.before || now.boss !== entered.boss) return;
    this.entered = null;
    if (!this.play!.lairs.includes(entered.lair)) this.play!.lairs.push(entered.lair);
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

  /** The client's step (`Hero.step` of client/src/openworld.ts, then `OpenWorldMode.troopPush`): the engine says whether the hero enters
   * `to` (`world_enter`); then an obstacle there is broken, the troop trails the hero (`world_trail`) and plays its push when one is
   * legal (`WorldFight.troop_push`), the hero and the troop taking the cells it gives. `null` when the step is refused: nothing changes. */
  private roll(to: Cell): { smashed: 'boulder' | 'tree' | null; push: Push | null } | null {
    const play = this.play!;
    const { hero, fight, seed } = play;
    const code = this.terrain(to[0], to[1]);
    const trees = code === TREE && DELTAS.some(([dq, dr]) => this.terrain(to[0] + dq, to[1] + dr) === TREE);
    const entry = this.rules.world_enter(hero[0], hero[1], to[0], to[1], code ?? -1, this.occupied(to), trees);
    if (entry === REFUSED) return null;
    const smashed = entry === BREAKS ? (NAMES[code!] as 'boulder' | 'tree') : null;
    if (smashed) play.broken.push(to);
    play.troop = pairs(this.rules.world_trail(flat(play.troop), hero[0], hero[1], to[0], to[1]));
    play.hero = to;
    const out = fight.troop_push(seed, flat([to, ...play.troop]), this.chunksAround(to, this.rules.WorldFight.push_reach()), flat(play.broken));
    if (!out) return { smashed, push: null };
    const [pushedHero, ...pushedTroop] = pairs(out.troop);
    play.hero = pushedHero!;
    play.troop = pushedTroop;
    const direction = DIRECTIONS[DELTAS.findIndex((d) => same(d, [out.dir[0]!, out.dir[1]!]))]!;
    return { smashed, push: { direction, ejected: pairs(out.ejected).map(text) } };
  }

  /** Why the hero cannot enter `to`, in words. */
  private reason(to: Cell): string {
    if (this.occupied(to)) return 'an enemy stands there';
    const code = this.terrain(to[0], to[1]);
    return code === undefined ? 'off the world' : `${NAMES[code]} in the way`;
  }

  /** Whether an enemy marble stands on `cell` now, the pushes included. */
  private occupied(cell: Cell): boolean {
    const generated = this.generated(Math.floor(cell[0] / CHUNK), Math.floor(cell[1] / CHUNK));
    return this.play!.fight.occupied(flat(generated), cell[0], cell[1]);
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

  /** The enemies the seed puts on the chunk `(cx, cy)`, before any push. */
  private generated(cx: number, cy: number): Cell[] {
    const key = `${cx},${cy}`;
    let cells = this.groups.get(key);
    if (!cells) this.groups.set(key, (cells = pairs(this.rules.world_enemies(this.play!.seed, cx, cy))));
    return cells;
  }

  /** The chunks that reach the cells within `radius` of `at`, in the bridge's list: `cx, cy, n`, then the `n` generated enemies. */
  private chunksAround(at: Cell, radius: number): Int32Array {
    const chunks: number[] = [];
    for (let cy = Math.floor((at[1] - radius) / CHUNK); cy <= Math.floor((at[1] + radius) / CHUNK); cy++) {
      for (let cx = Math.floor((at[0] - radius) / CHUNK); cx <= Math.floor((at[0] + radius) / CHUNK); cx++) {
        const cells = this.generated(cx, cy);
        chunks.push(cx, cy, cells.length, ...cells.flat());
      }
    }
    return Int32Array.from(chunks);
  }

  /** The enemy marbles within `radius` cells of `at` now, the pushes included (`WorldFight.around`). */
  private enemiesAround(at: Cell, radius: number): Cell[] {
    return pairs(this.play!.fight.around(this.chunksAround(at, radius), at[0], at[1], radius));
  }

  private view(radius: number): WorldState {
    const { seed, hero, troop, broken, fight, lairs } = this.play!;
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
      beaten: fight.beaten(),
      enemies: enemies.map(text),
      lairs: this.lairCells.map((cell, k) => ({ boss: this.bossOf(k), cell: text(cell), distance: hex(hero, cell), beaten: lairs.includes(k) })),
      // The client's ending (`OpenWorldMode.showTally`): every lair beaten, counted as the client counts them.
      ...(this.lairCells.length > 0 && lairs.length >= this.lairCells.length ? { ending: endingLine(CREW) } : {}),
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
