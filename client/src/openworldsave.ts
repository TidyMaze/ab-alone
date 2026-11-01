// The Open world save (docs/specs/openworld.md section 5, #968): the hero, the troop and the fight of a seed's world, one record
// per seed in the game store of IndexedDB (idb.ts), next to the local game and the run. The last world played is remembered
// under its own key, so the menu resumes it. A save of another world version (the generator changed, its cells mean something
// else) or one that does not decode is deleted: the world starts fresh. Storage that fails never throws to the page.
import type { Axial } from './board';
import { TROOP } from './openworld';
import { decodeFight, isCell, type FightSave, type FightState } from './openworldfight';
import type { KeyStore } from './savegame';

/** A world as saved: the seed, the hero's cell, the troop's cells (the hero's trail, `TROOP` at most), the fight and the camera's yaw
 * round the hero, in radians (#1026). */
export interface WorldSave {
  version: number;
  seed: number;
  hero: Axial;
  troop: Axial[];
  fight: FightSave;
  yaw: number;
  /** The obstacles the hero broke (#1147). A record saved before them has none. */
  broken: Axial[];
  /** The boss lairs the hero has beaten (#1170), by number. A record saved before them has none. */
  lairs: number[];
  savedAt: number;
}

/** The record version written now: 2 adds the camera's yaw, 3 the beaten lairs (#1170). A record of version 1 (no `record` field, no
 * yaw) is read with yaw 0, one of version 1 or 2 with no beaten lair, so an old save is kept, not lost (#1026). */
export const RECORD = 3;

/** The saves of the Open world. A failing store gives no save and a `false` put, never a throw. */
export interface WorldSaves {
  /** The save of `seed` for this world version, `null` when there is none (a stale or garbage one is deleted). */
  load(seed: number): Promise<WorldSave | null>;
  /** Saves the world of `seed` in the state given, the camera's `yaw` too; `true` when it is stored. */
  put(seed: number, hero: Axial, troop: Axial[], fight: FightState, yaw: number, broken?: readonly Axial[], lairs?: readonly number[]): Promise<boolean>;
  /** Marks lair `lair` of the saved world of `seed` as beaten (#1170); nothing when there is no save or the store fails. */
  beat(seed: number, lair: number): Promise<void>;
  /** Deletes the save of `seed`: the New world control discards the world it leaves (#1021). A refusing store keeps it. */
  discard(seed: number): Promise<void>;
  /** Remembers `seed` as the last world played. */
  remember(seed: number): Promise<void>;
  /** The seed of the last world played, `null` when there is none. */
  last(): Promise<number | null>;
}

const LAST = 'openworld:last';
const keyOf = (seed: number): string => `openworld:${seed}`;

/** The save in `raw` when it is a whole save of `seed` for `version`; `null` otherwise. */
export function decodeWorld(raw: unknown, seed: number, version: number): WorldSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof WorldSave | 'record', unknown>;
  if (save.version !== version || save.seed !== seed) return null;
  if (save.record !== undefined && save.record !== 2 && save.record !== RECORD) return null;
  const yaw = save.record === undefined ? 0 : save.yaw; // version 1: no turn yet (#1026)
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null;
  const broken = save.broken ?? []; // saved before the broken obstacles (#1147): none
  if (!Array.isArray(broken) || !broken.every(isCell)) return null;
  const lairs = save.record === RECORD ? save.lairs : []; // saved before the lairs: none beaten (#1170)
  if (!Array.isArray(lairs) || !lairs.every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (!isCell(save.hero) || !Array.isArray(save.troop) || save.troop.length > TROOP || !save.troop.every(isCell)) return null;
  const fight = decodeFight(save.fight);
  if (!fight || !Number.isFinite(save.savedAt)) return null;
  return {
    version,
    seed,
    hero: [save.hero[0], save.hero[1]],
    troop: save.troop.map(([q, r]): Axial => [q, r]),
    fight,
    yaw,
    broken: broken.map(([q, r]): Axial => [q, r]),
    lairs: [...lairs] as number[],
    savedAt: save.savedAt as number,
  };
}

/** The Open world saves in `store`, for the world version `version` (`world_version()` of the bridge). */
export function worldSaves(store: KeyStore, version: number): WorldSaves {
  return {
    async load(seed) {
      try {
        const raw = await store.get(keyOf(seed));
        if (raw === undefined) return null;
        const save = decodeWorld(raw, seed, version);
        if (save) return save;
        await store.delete(keyOf(seed)); // another version, or garbage: the world starts fresh
      } catch {
        // Storage blocked: the world starts fresh.
      }
      return null;
    },
    async put(seed, hero, troop, fight, yaw, broken = [], lairs = []) {
      try {
        const save = { record: RECORD, version, seed, hero, troop, fight: fight.toJSON(), yaw, broken, lairs, savedAt: Date.now() };
        await store.put(keyOf(seed), save);
        return true;
      } catch {
        return false; // storage blocked or full: the game goes on without this save
      }
    },
    async beat(seed, lair) {
      try {
        const raw = await store.get(keyOf(seed));
        const save = raw === undefined ? null : decodeWorld(raw, seed, version);
        if (save && !save.lairs.includes(lair)) await store.put(keyOf(seed), { ...(raw as object), record: RECORD, yaw: save.yaw, broken: save.broken, lairs: [...save.lairs, lair] });
      } catch {
        // Storage blocked: the lair is beaten in the medals only.
      }
    },
    async discard(seed) {
      try {
        await store.delete(keyOf(seed));
      } catch {
        // Storage blocked: the save stays, and the world is left as it is.
      }
    },
    async remember(seed) {
      try {
        await store.put(LAST, { seed });
      } catch {
        // Storage blocked: the menu picks a new world.
      }
    },
    async last() {
      try {
        const raw = (await store.get(LAST)) as { seed?: unknown } | undefined;
        return typeof raw?.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : null;
      } catch {
        return null;
      }
    },
  };
}
