// The enemy marbles of the Open world fight (docs/specs/openworld.md section 3): the generated enemies of the seed, with the
// pushes of the troop on top. The generated ones never change: a push removes the ones it moved away (`removed`, by cell) and
// adds the ones that now stand where no generated enemy starts (`added`). The state is plain data, saved as `toJSON`.
import { WorldFight } from 'abalone-wasm';
import type { Axial } from './board';
import { chunkOf, type World } from './openworld';

const key = ([q, r]: Axial): string => `${q},${r}`;

/** The saved form of a fight: the generated enemies gone (cell keys), the enemies on other cells, the enemies ejected. */
export interface FightSave {
  removed: string[];
  added: Axial[];
  beaten: number;
}

/** Whether `raw` is a cell: two integers. */
export const isCell = (raw: unknown): raw is Axial => Array.isArray(raw) && raw.length === 2 && raw.every((v) => Number.isSafeInteger(v));

/** The saved form of a fight read back from `raw` (a save read from the store), `null` when it is not one. */
export function decodeFight(raw: unknown): FightSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof FightSave, unknown>;
  const keyed = (k: unknown): boolean => typeof k === 'string' && /^-?\d+,-?\d+$/.test(k);
  if (!Array.isArray(save.removed) || !save.removed.every(keyed)) return null;
  if (!Array.isArray(save.added) || !save.added.every(isCell)) return null;
  if (!Number.isSafeInteger(save.beaten) || (save.beaten as number) < 0) return null;
  return { removed: save.removed as string[], added: save.added as Axial[], beaten: save.beaten as number };
}

/** What `world_push` gave: the new troop cells (the hero's first), the new enemy cells, the enemy ejected (none or one) and the
 * direction of the push. */
export interface Pushed {
  troop: Axial[];
  enemies: Axial[];
  ejected: Axial[];
  dir: Axial;
}

/** The read form of a push of the bridge (`world_push`, docs/specs/openworld.md section 4): `null` when no push was legal. */
export function readPush(out: ArrayLike<number>): Pushed | null {
  if (out.length === 0) return null;
  const pairs = (from: number, n: number): Axial[] => Array.from({ length: n }, (_, i): Axial => [out[from + 2 * i]!, out[from + 2 * i + 1]!]);
  const troopCount = out[3]!;
  const enemyCount = out[4 + 2 * troopCount]!;
  const dirAt = 5 + 2 * troopCount + 2 * enemyCount;
  return {
    troop: pairs(4, troopCount),
    enemies: pairs(5 + 2 * troopCount, enemyCount),
    ejected: out[2] === 0 ? [] : [[out[0]!, out[1]!]],
    dir: [out[dirAt]!, out[dirAt + 1]!],
  };
}

/** The flat `q, r` list of cells, for the bridge. */
const flat = (cells: readonly Axial[]): Int32Array => Int32Array.from(cells.flat());
/** The cells of a flat `q, r` list. */
const cellsOf = (list: ArrayLike<number>): Axial[] => Array.from({ length: list.length / 2 }, (_, i): Axial => [list[2 * i]!, list[2 * i + 1]!]);

/** The enemies of a fight, on top of the generated ones of a seed's world. What the pushes changed lives in the engine
 * (`WorldFight`, abalone-core `worldoverlay`), which holds the rule; this reads the generated enemies of the world for it. */
export class FightState {
  private fight = new WorldFight();

  /** The enemies ejected so far. */
  get beaten(): number {
    return this.fight.beaten();
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

  /** The enemies within `radius` cells (hex distance) of `cell`, on the chunks that reach them. */
  enemiesAround(world: World, cell: Axial, radius: number): Axial[] {
    const [x0, y0] = chunkOf([cell[0] - radius, cell[1] - radius]);
    const [x1, y1] = chunkOf([cell[0] + radius, cell[1] + radius]);
    const chunks: number[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const generated = world.enemies(cx, cy);
        chunks.push(cx, cy, generated.length, ...generated.flat());
      }
    }
    return cellsOf(this.fight.around(Int32Array.from(chunks), cell[0], cell[1], radius));
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
