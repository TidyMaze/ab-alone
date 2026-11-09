// The Open world save (docs/specs/openworld.md section 5, #968): the hero, the troop and the fight of a seed's world, one record
// per seed in the game store of IndexedDB (idb.ts), next to the local game and the run. The last world played is remembered
// under its own key, so the menu resumes it. A save of another world version (the generator changed, its cells mean something
// else) or one that does not decode is deleted: the world starts fresh. Storage that fails never throws to the page.
import type { Axial } from './board';
import { CYCLE_MS } from './daynight';
import { TROOP } from './openworld';
import { decodeDiscovered, type DiscoveredSave } from './openworlddiscovered';
import { decodeFight, isCell, type FightSave, type FightState } from './openworldfight';
import { RECRUIT_MAX } from './openworldrecruit';
import { addResources, NO_ARMY, NO_RESOURCES, type Army, decodeArmy, decodeResources, lairYield, type Resources, wildYield } from './openworldresources';
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
  /** The cells discovered (#1411), a bitset per chunk. A record saved before them has none: the mode discovers the cells round the hero. */
  discovered: DiscoveredSave;
  /** The time of day (#1496), in ms into the 12 minute cycle. A record saved before the cycle starts at the start of day. */
  time: number;
  /** The numbers of the lore logs found (#1589), the order of the bridge's `world_logs`. A record saved before them has none. */
  logs: number[];
  /** The marbles that joined the troop after a push ejected one (#1531), at most `RECRUIT_MAX`: the troop holds `TROOP` and them. A record saved before them has none. */
  recruits: number;
  /** What the world's own actions gathered (#1655): wood, ore, parts and shards. A record saved before them has none. */
  resources: Resources;
  /** The army of the Workshop (#1655, slice 2), empty until it opens. A record saved before it has none. */
  army: Army;
  savedAt: number;
}

/** The record version written now: 2 adds the camera's yaw, 3 the beaten lairs (#1170), 4 the discovered cells (#1411), 5 the time of day
 * (#1496), 6 the lore logs found (#1589), 7 the recruits (#1531), 8 the resources and the army (#1655). A record of version 1 (no `record` field, no yaw) is read with yaw 0, one of version 1 or 2 with no
 * beaten lair, one before 4 with no cell discovered, one before 5 at the start of day, one before 6 with no log found, one before 7 with no
 * recruit, one before 8 with zero resources and no army, so an old save is kept, not lost (#1026). */
export const RECORD = 8;

/** The saves of the Open world. A failing store gives no save and a `false` put, never a throw. */
export interface WorldSaves {
  /** The save of `seed` for this world version, `null` when there is none (a stale or garbage one is deleted). */
  load(seed: number): Promise<WorldSave | null>;
  /** Saves the world of `seed` in the state given, the camera's `yaw` too; `true` when it is stored. */
  put(seed: number, hero: Axial, troop: Axial[], fight: FightState, yaw: number, broken?: readonly Axial[], lairs?: readonly number[], discovered?: DiscoveredSave, time?: number, logs?: readonly number[], recruits?: number, resources?: Resources, army?: Army): Promise<boolean>;
  /** Marks lair `lair` of the saved world of `seed` as beaten (#1170), once, with the shards of a lair beaten (#1655); nothing when there is no save or the store fails. */
  beat(seed: number, lair: number): Promise<void>;
  /** Marks the generated marble that starts on `home` as beaten in the saved world of `seed` (#1511): gone, and counted, as one the troop ejected, with the parts of a wild fight won, once (#1655);
   * nothing when there is no save, the marble is gone already, or the store fails. */
  beatMarble(seed: number, home: Axial): Promise<void>;
  /** Replaces the resources and the army of the saved world of `seed` (#1655): what the Workshop sold and bought, the loadout, the marbles a wild fight threw off;
   * nothing when there is no save or the store fails. */
  setStock(seed: number, resources: Resources, army: Army): Promise<void>;
  /** Deletes the save of `seed`: the New world control discards the world it leaves (#1021). A refusing store keeps it. */
  discard(seed: number): Promise<void>;
  /** Remembers `seed` as the last world played. */
  remember(seed: number): Promise<void>;
  /** The seed of the last world played, `null` when there is none. */
  last(): Promise<number | null>;
}

const LAST = 'openworld:last';
const keyOf = (seed: number): string => `openworld:${seed}`;

/** The most broken cells and lair numbers a save holds, and how far (hex steps) a troop cell may be from the hero. */
const MAX_BROKEN = 100_000;
const MAX_LAIRS = 100_000;
const TROOP_REACH = 20;

/** The save in `raw` when it is a whole save of `seed` for `version`; `null` otherwise. */
export function decodeWorld(raw: unknown, seed: number, version: number): WorldSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof WorldSave | 'record', unknown>;
  if (save.version !== version || save.seed !== seed) return null;
  if (save.record !== undefined && ![2, 3, 4, 5, 6, 7, RECORD].includes(save.record as number)) return null;
  const record = (save.record ?? 1) as number; // version 1 wrote none
  const yaw = record === 1 ? 0 : save.yaw; // version 1: no turn yet (#1026)
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null;
  const broken = save.broken ?? []; // saved before the broken obstacles (#1147): none
  if (!Array.isArray(broken) || broken.length > MAX_BROKEN || !broken.every(isCell)) return null;
  const lairs = record >= 3 ? save.lairs : []; // saved before the lairs: none beaten (#1170)
  if (!Array.isArray(lairs) || lairs.length > MAX_LAIRS || !lairs.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LAIRS)) return null;
  const discovered = decodeDiscovered(record >= 4 ? save.discovered : []); // saved before the discovery: none (#1411)
  if (!discovered) return null;
  const time = record >= 5 ? save.time : 0; // saved before the cycle: the start of day (#1496)
  if (typeof time !== 'number' || !(time >= 0 && time < CYCLE_MS)) return null;
  const logs = record >= 6 ? save.logs : []; // saved before the lore logs: none found (#1589)
  if (!Array.isArray(logs) || logs.length > MAX_LAIRS || !logs.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LAIRS)) return null;
  const recruits = record >= 7 ? save.recruits : 0; // saved before the recruits: none (#1531)
  if (!Number.isInteger(recruits) || (recruits as number) < 0 || (recruits as number) > RECRUIT_MAX) return null;
  const resources = decodeResources(record >= 8 ? (save.resources ?? null) : undefined); // saved before the resources: none (#1655)
  const army = decodeArmy(record >= 8 ? (save.army ?? null) : undefined);
  if (!resources || !army) return null;
  if (!isCell(save.hero) || !Array.isArray(save.troop) || save.troop.length > TROOP + (recruits as number) || !save.troop.every(isCell)) return null;
  const [hq, hr] = save.hero;
  if (!save.troop.every(([q, r]) => Math.max(Math.abs(q! - hq!), Math.abs(r! - hr!), Math.abs(q! - hq! + r! - hr!)) <= TROOP_REACH)) return null; // the troop is the hero's trail
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
    discovered,
    time,
    logs: [...logs] as number[],
    recruits: recruits as number,
    resources,
    army,
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
    async put(seed, hero, troop, fight, yaw, broken = [], lairs = [], discovered = [], time = 0, logs = [], recruits = 0, resources = NO_RESOURCES, army = NO_ARMY) {
      try {
        const save = { record: RECORD, version, seed, hero, troop, fight: fight.toJSON(), yaw, broken, lairs, discovered, time, logs, recruits, resources, army, savedAt: Date.now() };
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
        if (save && !save.lairs.includes(lair)) await store.put(keyOf(seed), { ...(raw as object), record: RECORD, yaw: save.yaw, broken: save.broken, lairs: [...save.lairs, lair], discovered: save.discovered, time: save.time, logs: save.logs, recruits: save.recruits, resources: addResources(save.resources, lairYield()), army: save.army });
      } catch {
        // Storage blocked: the lair is beaten in the medals only.
      }
    },
    async beatMarble(seed, home) {
      try {
        const raw = await store.get(keyOf(seed));
        const save = raw === undefined ? null : decodeWorld(raw, seed, version);
        const key = home.join(',');
        if (save && !save.fight.removed.includes(key)) {
          const fight = { ...save.fight, removed: [...save.fight.removed, key], beaten: save.fight.beaten + 1 };
          await store.put(keyOf(seed), { ...(raw as object), record: RECORD, yaw: save.yaw, broken: save.broken, lairs: save.lairs, discovered: save.discovered, time: save.time, logs: save.logs, recruits: save.recruits, resources: addResources(save.resources, wildYield(home)), army: save.army, fight });
        }
      } catch {
        // Storage blocked: the marble comes back with the world.
      }
    },
    async setStock(seed, resources, army) {
      try {
        const raw = await store.get(keyOf(seed));
        const save = raw === undefined ? null : decodeWorld(raw, seed, version);
        if (save) await store.put(keyOf(seed), { ...(raw as object), record: RECORD, resources, army });
      } catch {
        // Storage blocked: the stock stays as it was saved.
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
