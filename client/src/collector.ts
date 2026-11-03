// The Collector's blueprints (#1470, docs/specs/roguelite.md section 15): the content a run can lock, and where the ones
// banked are kept between runs. The run itself (cells, blueprints carried, the room) is in roguelite.ts.

import { read, write, type Store } from './quality';

/** What a blueprint unlocks: a relic (by its code), a tactic (by its code) or a special marble type (by the bridge's kind). */
export type BlueprintType = 'relic' | 'tactic' | 'special';
export interface Blueprint {
  type: BlueprintType;
  code: number;
}

/** The blueprints, by id. The ids are kept in the browser and in saved runs, so the list only grows at its end. The relics
 * from the Lucky coin on and the tactics Swap and Fall back stay out of the pools until banked. The special marbles are the
 * ones the acts won in one run unlock (roguelite.ts `KIND_ACTS`): banking one unlocks it at once, whatever the acts won. */
export const BLUEPRINTS: readonly Blueprint[] = [
  { type: 'relic', code: 6 },
  { type: 'relic', code: 7 },
  { type: 'relic', code: 8 },
  { type: 'relic', code: 9 },
  { type: 'relic', code: 10 },
  { type: 'relic', code: 11 },
  { type: 'tactic', code: 3 },
  { type: 'tactic', code: 4 },
  { type: 'special', code: 2 }, // Anchor
  { type: 'special', code: 3 }, // Spark
  { type: 'special', code: 8 }, // Shield
  { type: 'special', code: 10 }, // Medic
  { type: 'special', code: 7 }, // Magnet
  { type: 'special', code: 9 }, // Bomb
];

/** The id of the blueprint of `type` and `code`, or -1 for an item every run holds. */
export const blueprintId = (type: BlueprintType, code: number): number => BLUEPRINTS.findIndex((b) => b.type === type && b.code === code);

/** What a run saved before the Collector counts as unlocked: its relics and tactics (the special marbles go by its acts). */
export const LEGACY_UNLOCKED: readonly number[] = BLUEPRINTS.flatMap((b, id) => (b.type === 'special' ? [] : [id]));

/** Cells earned by a won fight, a won elite and a beaten act boss. */
export const CELLS = { fight: 2, elite: 4, boss: 6 } as const;
/** Cells a blueprint costs at the Collector. */
export const COLLECT_COST = 5;

/** Where the blueprints banked are kept, next to the other progress (roguelite.ts `ab-alone.roguelite`). */
const KEY = 'ab-alone.roguelite.blueprints';
const valid = (id: unknown): id is number => Number.isInteger(id) && (id as number) >= 0 && (id as number) < BLUEPRINTS.length;

/** The blueprints banked in earlier runs, none when nothing valid is saved or the storage is blocked. */
export function readUnlocked(store: Store): number[] {
  try {
    const ids: unknown = JSON.parse(read(store, KEY) ?? '[]');
    return Array.isArray(ids) && ids.every((id, i) => valid(id) && ids.indexOf(id) === i) ? ids : [];
  } catch {
    return [];
  }
}

/** Keeps the blueprints `ids` banked, once each, with the ones kept already. */
export function recordUnlocked(store: Store, ids: number[]): void {
  const kept = readUnlocked(store);
  const all = [...kept, ...[...new Set(ids)].filter((id) => valid(id) && !kept.includes(id))];
  if (all.length > kept.length) write(store, KEY, JSON.stringify(all));
}
