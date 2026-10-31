// The enemy marbles of the Open world fight (docs/specs/openworld.md section 3): the generated enemies of the seed, with the
// pushes of the troop on top. The generated ones never change: a push removes the ones it moved away (`removed`, by cell) and
// adds the ones that now stand where no generated enemy starts (`added`). The state is plain data, saved as `toJSON`.
import type { Axial } from './board';
import { chunkOf, same, type World } from './openworld';

const key = ([q, r]: Axial): string => `${q},${r}`;

/** The hex distance of two cells. */
const distance = ([q1, r1]: Axial, [q2, r2]: Axial): number => (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 - q2 + r1 - r2)) / 2;

/** The saved form of a fight: the generated enemies gone (cell keys), the enemies on other cells, the enemies ejected. */
export interface FightSave {
  removed: string[];
  added: Axial[];
  beaten: number;
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

/** The enemies of a fight, on top of the generated ones of a seed's world. */
export class FightState {
  /** The generated enemies a push moved away or ejected, by cell key. */
  private readonly removed = new Set<string>();
  /** The enemies on cells where no generated enemy starts, by cell key. */
  private readonly added = new Map<string, Axial>();
  /** The enemies ejected so far. */
  beaten = 0;

  /** Forgets every push: the generated enemies are all back, none beaten. */
  reset(): void {
    this.removed.clear();
    this.added.clear();
    this.beaten = 0;
  }

  /** Hides the generated enemies of the chunks `reach` around `(cx, cy)`: a test fixture replaces them with its own. */
  hide(world: World, cx: number, cy: number, reach: number): void {
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        for (const cell of world.enemies(kx, ky)) this.removed.add(key(cell));
      }
    }
  }

  /** The enemies on the chunk `(cx, cy)` now: the generated ones not moved, and the ones pushed onto it. */
  chunkEnemies(world: World, cx: number, cy: number): Axial[] {
    const cells = world.enemies(cx, cy).filter((cell) => !this.removed.has(key(cell)));
    for (const cell of this.added.values()) if (same(chunkOf(cell), [cx, cy])) cells.push(cell);
    return cells;
  }

  /** The enemies within `radius` cells (hex distance) of `cell`, on the chunks that reach them. */
  enemiesAround(world: World, cell: Axial, radius: number): Axial[] {
    const [x0, y0] = chunkOf([cell[0] - radius, cell[1] - radius]);
    const [x1, y1] = chunkOf([cell[0] + radius, cell[1] + radius]);
    const out: Axial[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const enemy of this.chunkEnemies(world, cx, cy)) if (distance(enemy, cell) <= radius) out.push(enemy);
      }
    }
    return out;
  }

  /** Whether an enemy marble stands on the cell `(q, r)` now. */
  occupied(world: World, q: number, r: number): boolean {
    const k = key([q, r]);
    if (this.added.has(k)) return true;
    return !this.removed.has(k) && world.enemies(...chunkOf([q, r])).some((enemy) => same(enemy, [q, r]));
  }

  /** Plays a push on the overlay: the enemies `oldEnemies` leave their cells, the enemies `newEnemies` stand on theirs, and the
   * `ejected` ones count as beaten. A generated enemy that comes back to its cell is that generated enemy again. */
  apply(oldEnemies: readonly Axial[], newEnemies: readonly Axial[], ejected: readonly Axial[]): void {
    for (const cell of oldEnemies) {
      const k = key(cell);
      if (this.added.has(k)) this.added.delete(k);
      else this.removed.add(k);
    }
    for (const cell of newEnemies) {
      const k = key(cell);
      if (this.removed.has(k)) this.removed.delete(k);
      else this.added.set(k, cell);
    }
    this.beaten += ejected.length;
  }

  /** The plain form of the fight, saved with the world (#968). `JSON.stringify` of a fight gives the same. */
  toJSON(): FightSave {
    return { removed: [...this.removed], added: [...this.added.values()], beaten: this.beaten };
  }

  /** The fight of a saved form. */
  static fromJSON(save: FightSave): FightState {
    const fight = new FightState();
    for (const k of save.removed) fight.removed.add(k);
    for (const cell of save.added) fight.added.set(key(cell), cell);
    fight.beaten = save.beaten;
    return fight;
  }
}
