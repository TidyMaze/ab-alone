// The Open world save (docs/specs/openworld.md section 5, #968): the hero, the troop and the fight of a seed's world, one record
// per seed in the game store of IndexedDB (idb.ts), next to the local game and the run. The last world played is remembered
// under its own key, so the menu resumes it. A save of another world version (the generator changed, its cells mean something
// else) or one whose hero does not decode is kept aside under `openworld:<seed>:refused`, never deleted, and the world starts fresh; a field that
// does not decode is reset to its default and the rest of the record is kept (#1661). Storage that fails never throws to the page.
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

/** The save in `raw` for `seed` and `version`; `null` when it is not one of that world: not an object, another seed or world version, a record version
 * this build does not know, or a hero that is not a cell. Every other field that does not decode is reset to its default and named in a `console.warn`
 * (#1661): a record of the right seed and version is never lost for one bad field, the progress in the others is kept. */
export function decodeWorld(raw: unknown, seed: number, version: number): WorldSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof WorldSave | 'record', unknown>;
  if (save.version !== version || save.seed !== seed) return null;
  if (save.record !== undefined && ![2, 3, 4, 5, 6, 7, RECORD].includes(save.record as number)) return null;
  if (!isCell(save.hero)) return null;
  const hero = save.hero;
  const record = (save.record ?? 1) as number; // version 1 wrote none
  /** `value` when it decoded (not `null`), else `fallback`, with the field named in a warning. */
  const kept = <T>(field: string, value: T | null, fallback: T): T => {
    if (value !== null) return value;
    console.warn(`openworld: the saved ${field} of world ${seed} does not decode and is reset to its default`);
    return fallback;
  };
  const numbers = (list: unknown): number[] | null => (Array.isArray(list) && list.length <= MAX_LAIRS && list.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LAIRS) ? (list as number[]) : null);
  const yaw = record === 1 ? 0 : save.yaw; // version 1: no turn yet (#1026)
  const broken = save.broken ?? []; // saved before the broken obstacles (#1147): none
  const time = record >= 5 ? save.time : 0; // saved before the cycle: the start of day (#1496)
  const recruits = kept('recruits', record < 7 || (Number.isInteger(save.recruits) && (save.recruits as number) >= 0 && (save.recruits as number) <= RECRUIT_MAX) ? ((record >= 7 ? save.recruits : 0) as number) : null, 0); // saved before the recruits: none (#1531)
  const troop = save.troop;
  const reach = ([q, r]: Axial): number => Math.max(Math.abs(q - hero[0]), Math.abs(r - hero[1]), Math.abs(q - hero[0] + r - hero[1]));
  return {
    version,
    seed,
    hero: [hero[0], hero[1]],
    troop: kept('troop', Array.isArray(troop) && troop.length <= TROOP + recruits && troop.every(isCell) && troop.every((cell) => reach(cell) <= TROOP_REACH) ? troop.map(([q, r]): Axial => [q, r]) : null, []), // the troop is the hero's trail
    fight: kept('fight', decodeFight(save.fight), { removed: [], added: [], beaten: 0 }),
    yaw: kept('yaw', typeof yaw === 'number' && Number.isFinite(yaw) ? yaw : null, 0),
    broken: kept('broken', Array.isArray(broken) && broken.length <= MAX_BROKEN && broken.every(isCell) ? broken.map(([q, r]): Axial => [q, r]) : null, []),
    lairs: kept('lairs', numbers(record >= 3 ? save.lairs : []), []), // saved before the lairs: none beaten (#1170)
    discovered: kept('discovered', decodeDiscovered(record >= 4 ? save.discovered : []), []), // saved before the discovery: none (#1411)
    time: kept('time', typeof time === 'number' && time >= 0 && time < CYCLE_MS ? time : null, 0),
    logs: kept('logs', numbers(record >= 6 ? save.logs : []), []), // saved before the lore logs: none found (#1589)
    recruits,
    resources: kept('resources', decodeResources(record >= 8 ? (save.resources ?? null) : undefined), NO_RESOURCES), // saved before the resources: none (#1655)
    army: kept('army', decodeArmy(record >= 8 ? (save.army ?? null) : undefined), NO_ARMY),
    savedAt: kept('savedAt', Number.isFinite(save.savedAt) ? (save.savedAt as number) : null, 0),
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
        await store.put(`${keyOf(seed)}:refused`, raw); // another version, another seed or a hero that is no cell: kept aside, never deleted (#1661); the world starts fresh
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
