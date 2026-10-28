// Boss medals (#791): one per beaten boss, with the fewest player turns the player needed, kept in localStorage as a
// JSON object boss id -> turns. Daily and co-op wins count too (main.ts records every boss win). Pure functions only:
// main.ts gives the storage. `hasMedal` is what the auto-play task (#792) asks. Safe in private mode (quality read/write).
import { read, write, type Store } from './quality';

export type Medals = Record<string, number>;
/** What a win did to the medal: earned it, beat its record, or left it as it was. */
export type MedalResult = 'first' | 'record' | 'kept';

const KEY = 'ab-alone.medals';

/** The saved medals; entries that are no positive whole turn count are dropped. */
export function loadMedals(store: Store): Medals {
  const medals: Medals = {};
  try {
    const saved: unknown = JSON.parse(read(store, KEY) ?? '{}');
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return medals;
    for (const [id, turns] of Object.entries(saved)) if (Number.isInteger(turns) && turns > 0) medals[id] = turns;
  } catch {
    // Not JSON: no medal.
  }
  return medals;
}

/** The fewest turns the player needed to beat `boss`, null with no medal. */
export const bestTurns = (store: Store, boss: string): number | null => loadMedals(store)[boss] ?? null;

/** Has the player the medal of `boss`? The question of the auto-play task (#792). */
export const hasMedal = (store: Store, boss: string): boolean => bestTurns(store, boss) !== null;

/** The player turns of a won fight of `plies` plies: Black moves first and the win is a Black ply. */
export const playerTurns = (plies: number): number => Math.ceil(plies / 2);

/** Records a win in `turns` player turns: the first win earns the medal, a faster one is a new record. */
export function recordMedal(store: Store, boss: string, turns: number): MedalResult {
  const medals = loadMedals(store);
  const best = medals[boss];
  if (best !== undefined && best <= turns) return 'kept';
  write(store, KEY, JSON.stringify({ ...medals, [boss]: turns }));
  return best === undefined ? 'first' : 'record';
}

const plural = (turns: number): string => `${turns} turn${turns === 1 ? '' : 's'}`;

/** The medal next to a beaten boss in the boss menu. */
export const medalLabel = (turns: number): string => `Medal: ${plural(turns)}`;

/** The medal line of the end banner of a won fight; `turns` is the best count (the record when there is one). */
export const medalLine = (result: MedalResult, turns: number): string =>
  `${{ first: 'Medal earned', record: 'New record', kept: 'Medal best' }[result]}: ${plural(turns)}.`;
