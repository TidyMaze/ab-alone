// The enemy marbles of the Open world fight (docs/specs/openworld.md section 3): the generated enemies of the seed, with the
// pushes of the troop on top. The generated ones never change: a push removes the ones it moved away (`removed`, by cell) and
// adds the ones that now stand where no generated enemy starts (`added`). The state is plain data, saved as `toJSON`.
import { WorldFight } from 'edgefall-wasm';
import type { Axial } from './board';
import { chunkOf, type World } from './openworld';
import type { Played } from './openworldview';

const key = ([q, r]: Axial): string => `${q},${r}`;

/** The saved form of a fight: the generated enemies gone (cell keys), the enemies on other cells, the enemies ejected. */
export interface FightSave {
  removed: string[];
  added: Axial[];
  beaten: number;
}

/** The farthest a cell of a save may be from the origin: far past any world a player walks, far below the integers the maths loses. */
const CELL_MAX = 1_000_000;

/** Whether `raw` is a cell: two integers within CELL_MAX. */
export const isCell = (raw: unknown): raw is Axial => Array.isArray(raw) && raw.length === 2 && raw.every((v) => Number.isSafeInteger(v) && Math.abs(v) <= CELL_MAX);

/** The saved form of a fight read back from `raw` (a save read from the store), `null` when it is not one. */
export function decodeFight(raw: unknown): FightSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof FightSave, unknown>;
  const keyed = (k: unknown): boolean => typeof k === 'string' && /^-?\d+,-?\d+$/.test(k);
  if (!Array.isArray(save.removed) || !save.removed.every(keyed)) return null;
  if (!Array.isArray(save.added) || !save.added.every(isCell)) return null;
  if (!Number.isSafeInteger(save.beaten) || (save.beaten as number) < 0 || (save.beaten as number) > CELL_MAX) return null;
  return { removed: save.removed as string[], added: save.added as Axial[], beaten: save.beaten as number };
}

/** What `WorldFight.troop_push` gave: the new troop cells (the hero's first), the new enemy cells, the enemy ejected (none or one), the cell
 * that one started on when it was a generated enemy (else its own, #1511: the cell the other heroes check) and the direction of the push. */
export interface Pushed {
  troop: Axial[];
  enemies: Axial[];
  ejected: Axial[];
  homes: Axial[];
  dir: Axial;
}

/** The marble that touches the hero (#1511): the cell it starts on, and the cell it stands on now. */
export interface Contact {
  home: Axial;
  at: Axial;
}

/** A follower the herd sends to a cell (#1506): its index among the followers, and the cell. */
export type Goal = readonly [number, Axial];

/** The flat `q, r` list of cells, for the bridge. */
const flat = (cells: readonly Axial[]): Int32Array => Int32Array.from(cells.flat());
/** The cells of a flat `q, r` list. */
const cellsOf = (list: ArrayLike<number>): Axial[] => Array.from({ length: list.length / 2 }, (_, i): Axial => [list[2 * i]!, list[2 * i + 1]!]);

/** The enemies of a fight, on top of the generated ones of a seed's world. What the pushes changed lives in the engine
 * (`WorldFight`, edgefall-core `worldoverlay`), which holds the rule; this reads the generated enemies of the world for it. */
export class FightState {
  private fight = new WorldFight();

  /** The enemies ejected so far. */
  get beaten(): number {
    return this.fight.beaten();
  }

  /** The length of a tick of the wandering clock in ms (edgefall-core `worldwander`): the marbles take one step each (#1511). */
  static get tickMs(): number {
    return WorldFight.tick_ms();
  }

  /** Sets the clock the wandering marbles stand at: the world `seed` and the `tick`, the same on every peer. Tick 0 has them where they
   * start, which is where a fight that never sets a clock leaves them. */
  setClock(seed: number, tick: number): void {
    this.fight.set_clock(seed, tick >>> 0);
  }

  /** Sets the cells of the troop the wandering groups never walk onto (#1590): a group whose next cell is one of them, or a shoved marble's,
   * waits a tick. This peer's drawing alone: the walk itself stays a function of the seed, the chunk and the clock. */
  setHeld(cells: readonly Axial[]): void {
    this.fight.set_held(flat(cells));
  }

  /** Forgets every push: the generated enemies are all back, none beaten. */
  reset(): void {
    this.fight.reset();
  }

  /** Hides the generated enemies of the chunks `reach` around `(cx, cy)`: a test fixture replaces them with its own. */
  hide(world: World, cx: number, cy: number, reach: number): void {
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) this.fight.hide(flat(world.enemies(kx, ky)));
    }
  }

  /** The enemies on the chunk `(cx, cy)` now: the generated ones not moved, and the ones pushed onto it. */
  chunkEnemies(world: World, cx: number, cy: number): Axial[] {
    return cellsOf(this.fight.chunk_enemies(flat(world.enemies(cx, cy)), cx, cy));
  }

  /** The generated enemies of the chunks that reach the cells within `radius` of `cell`, in the bridge's chunk list (`cx, cy, n`, the `n` cells). */
  private chunksAround(world: World, cell: Axial, radius: number): Int32Array {
    const [x0, y0] = chunkOf([cell[0] - radius, cell[1] - radius]);
    const [x1, y1] = chunkOf([cell[0] + radius, cell[1] + radius]);
    const chunks: number[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const generated = world.enemies(cx, cy);
        chunks.push(cx, cy, generated.length, ...generated.flat());
      }
    }
    return Int32Array.from(chunks);
  }

  /** The enemies within `radius` cells (hex distance) of `cell`, on the chunks that reach them. */
  enemiesAround(world: World, cell: Axial, radius: number): Axial[] {
    return cellsOf(this.fight.around(this.chunksAround(world, cell, radius), cell[0], cell[1], radius));
  }

  /** The enemies a push can reach: the ones near the hero's `cell`. */
  nearHero(world: World, cell: Axial): Axial[] {
    return this.enemiesAround(world, cell, WorldFight.push_reach());
  }

  /** The troop's attack (`WorldFight.troop_push`, edgefall-core `worldoverlay`): the best legal push of `troop` (the hero's cell first) in
   * the world `seed`, with the `broken` cells and the hero's step `tick` (a single marble also shoves a foe into the water, #1504), played on the fight. The push as it was played, from the cells before it; `null` when none
   * is legal. */
  troopPush(world: World, seed: number, troop: readonly Axial[], broken: readonly Axial[], tick: number): Played | null {
    const out = this.fight.troop_push(seed, flat(troop), this.chunksAround(world, troop[0]!, WorldFight.push_reach()), flat(broken), tick >>> 0);
    if (!out) return null;
    const push: Pushed = { troop: cellsOf(out.troop), enemies: cellsOf(out.enemies), ejected: cellsOf(out.ejected), homes: cellsOf(out.homes), dir: [out.dir[0]!, out.dir[1]!] };
    return { from: [...troop], foes: cellsOf(out.foes), push };
  }

  /** The cells the herd sends followers to before they flock (`WorldFight.herd_goals`, #1506): `troop` has the hero first. None without a hunt. */
  herdGoals(world: World, seed: number, troop: readonly Axial[], broken: readonly Axial[]): Goal[] {
    const out = this.fight.herd_goals(seed, flat(troop), this.chunksAround(world, troop[0]!, WorldFight.push_reach()), flat(broken));
    return Array.from({ length: out.length / 3 }, (_, i): Goal => [out[3 * i]!, [out[3 * i + 1]!, out[3 * i + 2]!]]);
  }

  /** The generated marble within one cell of the hero's `cell` that no push has moved (#1511), `null` when there is none. */
  wildContact(world: World, cell: Axial): Contact | null {
    const out = this.fight.wild_contact(this.chunksAround(world, cell, 1), cell[0], cell[1]);
    return out.length === 0 ? null : { home: [out[0]!, out[1]!], at: [out[2]!, out[3]!] };
  }

  /** Whether the generated marble that starts on `home` is still in the world, wherever it wandered to (#1511). */
  alive(world: World, home: Axial): boolean {
    return this.fight.alive(flat(world.enemies(...chunkOf(home))), home[0], home[1]);
  }

  /** Whether an enemy marble stands on the cell `(q, r)` now. */
  occupied(world: World, q: number, r: number): boolean {
    return this.fight.occupied(flat(world.enemies(...chunkOf([q, r]))), q, r);
  }

  /** Plays a push on the overlay: the enemies `oldEnemies` leave their cells, the enemies `newEnemies` stand on theirs, and the
   * `ejected` ones count as beaten. A generated enemy that comes back to its cell is that generated enemy again. */
  apply(oldEnemies: readonly Axial[], newEnemies: readonly Axial[], ejected: readonly Axial[]): void {
    this.fight.apply(flat(oldEnemies), flat(newEnemies), ejected.length);
  }

  /** The plain form of the fight, saved with the world (#968). `JSON.stringify` of a fight gives the same. */
  toJSON(): FightSave {
    return { removed: cellsOf(this.fight.removed()).map(key), added: cellsOf(this.fight.added()), beaten: this.fight.beaten() };
  }

  /** The fight of a saved form: a fresh one when the saved form does not decode (`decodeFight`). */
  static fromJSON(raw: unknown): FightState {
    const save = decodeFight(raw);
    const fight = new FightState();
    if (save) fight.fight = WorldFight.restore(Int32Array.from(save.removed.flatMap((k) => k.split(',').map(Number))), flat(save.added), save.beaten);
    return fight;
  }
}
