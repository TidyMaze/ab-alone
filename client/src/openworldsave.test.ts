import './test/openworldwasm';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { indexedDbStore } from './idb';
import { FightState } from './openworldfight';
import { Discovered, type DiscoveredSave } from './openworlddiscovered';
import { RECRUIT_MAX } from './openworldrecruit';
import { NO_ARMY, NO_RESOURCES } from './openworldresources';
import { worldSaves } from './openworldsave';
import { memoryStore, type KeyStore } from './savegame';

// The Open world save (docs/specs/openworld.md section 5): one record per seed, the last world remembered, a save of another
// world version or a garbage one dropped, and no failure of the storage thrown to the page.
afterEach(() => {
  vi.unstubAllGlobals();
});

const hero: Axial = [1, 0];
const troop: Axial[] = [
  [0, 0],
  [-1, 0],
];
const fightWithPush = (): FightState => {
  const fight = new FightState();
  fight.apply([[2, 0]], [[3, 0]], []);
  fight.apply([], [], [[9, 9]]); // an enemy ejected: beaten once
  return fight;
};
const saved = { removed: ['2,0'], added: [[3, 0]], beaten: 1 };
const record = (seed: number, version = 1) => ({ version, seed, hero, troop, fight: saved, yaw: 0, savedAt: 5 });

describe('the save of the camera yaw (#1026)', () => {
  it('saves the yaw with the world and loads it back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 1.25);
    expect((await saves.load(7))!.yaw).toBe(1.25);
  });

  it('loads a record of the previous record version, with no yaw, at the default angle: a migration, not a loss (#1026)', async () => {
    const store = memoryStore();
    const { yaw: _yaw, ...old } = record(7);
    store.data.set('openworld:7', old); // no record field: the version 1 layout
    const back = await worldSaves(store, 1).load(7);
    expect(back!.yaw).toBe(0);
    expect(back!.hero).toEqual(hero);
    expect(store.data.has('openworld:7')).toBe(true);
  });

  it('refuses a record of a record version this build does not know, a later one, and keeps it aside, not deleted (#1661)', async () => {
    const store = memoryStore();
    const later = { ...record(7), record: 9, yaw: 0 };
    store.data.set('openworld:7', later);
    expect(await worldSaves(store, 1).load(7)).toBeNull();
    expect(store.data.get('openworld:7')).toEqual(later);
    expect(store.data.get('openworld:7:refused')).toEqual(later);
  });

  it('keeps a record of this record version whose yaw is not a number, with the default angle, and says so (#1661)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 2, yaw: 'x' });
    expect(await worldSaves(store, 1).load(7)).toMatchObject({ yaw: 0, hero });
    expect(store.data.has('openworld:7')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('yaw'));
  });
});

describe('the save of the broken obstacles (#1147)', () => {
  it('saves the broken cells with the world and loads them back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [[2, 0], [-3, 4]]);
    expect((await saves.load(7))!.broken).toEqual([[2, 0], [-3, 4]]);
  });

  it('loads a record with no broken cells, saved before them, as none broken', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 2 });
    expect((await worldSaves(store, 1).load(7))!.broken).toEqual([]);
  });

  it('keeps a record whose broken cells are not cells, with none broken (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const broken of ['x', [[1]], [[1.5, 0]]]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...record(7), record: 2, broken });
      expect(await worldSaves(store, 1).load(7)).toMatchObject({ broken: [], hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });
});

describe('the save of the beaten lairs (#1170)', () => {
  it('saves the beaten lairs with the world and loads them back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [2, 0]);
    expect((await saves.load(7))!.lairs).toEqual([2, 0]);
  });

  it('loads a record of the record version 2 or none, saved before the lairs, as none beaten: old saves still load', async () => {
    for (const old of [{ ...record(7), record: 2 }, record(7)]) {
      const store = memoryStore();
      store.data.set('openworld:7', old);
      expect((await worldSaves(store, 1).load(7))!.lairs).toEqual([]);
    }
  });

  it('keeps a record of this record version whose lairs are not a list of lair numbers, with none beaten (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const lairs of [undefined, 'x', [-1], [1.5], ['a']]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...record(7), record: 3, yaw: 0, lairs });
      expect(await worldSaves(store, 1).load(7)).toMatchObject({ lairs: [], hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('beat adds a lair to the beaten ones of the saved world, once, and does nothing without a save', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.beat(7, 1);
    expect(await saves.load(7)).toBeNull();
    await saves.put(7, hero, troop, new FightState(), 0, [], [0]);
    await saves.beat(7, 1);
    await saves.beat(7, 1);
    expect((await saves.load(7))!.lairs).toEqual([0, 1]);
    expect((await saves.load(7))!.hero).toEqual(hero);
  });

  it('beat keeps an old save loadable: a record of the first version gets its yaw written', async () => {
    const store = memoryStore();
    const { yaw: _yaw, ...old } = record(7);
    store.data.set('openworld:7', old);
    await worldSaves(store, 1).beat(7, 2);
    const back = await worldSaves(store, 1).load(7);
    expect(back!.lairs).toEqual([2]);
    expect(back!.yaw).toBe(0);
  });

  it('beat leaves a store that fails alone', async () => {
    const store = memoryStore();
    await worldSaves(store, 1).put(7, hero, troop, new FightState(), 0);
    store.put = async () => {
      throw new Error('full');
    };
    await expect(worldSaves(store, 1).beat(7, 1)).resolves.toBeUndefined();
  });
});

describe('a marble beaten in a wild fight is saved gone (#1511)', () => {
  it('beatMarble removes the generated marble from the saved fight and counts it, once, and does nothing without a save', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.beatMarble(7, [5, 5]);
    expect(await saves.load(7)).toBeNull();
    await saves.put(7, hero, troop, new FightState(), 0, [], [0]);
    await saves.beatMarble(7, [5, 5]);
    await saves.beatMarble(7, [5, 5]);
    await saves.beatMarble(7, [6, -2]);
    const back = (await saves.load(7))!;
    expect(back.fight).toEqual({ removed: ['5,5', '6,-2'], added: [], beaten: 2 });
    expect(back.lairs).toEqual([0]);
    expect(back.hero).toEqual(hero);
  });

  it('beatMarble leaves a store that fails alone', async () => {
    const store = memoryStore();
    await worldSaves(store, 1).put(7, hero, troop, new FightState(), 0);
    store.put = async () => {
      throw new Error('full');
    };
    await expect(worldSaves(store, 1).beatMarble(7, [5, 5])).resolves.toBeUndefined();
  });
});

describe('the save of the discovered cells (#1411)', () => {
  const discovered = (): DiscoveredSave => {
    const seen = new Discovered();
    seen.reveal([0, 0]);
    return seen.toJSON();
  };

  it('saves the discovered cells with the world and loads them back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], discovered());
    expect((await saves.load(7))!.discovered).toEqual(discovered());
  });

  it('loads a record of the record version 3 or before, saved before the discovery, as nothing discovered: old saves still load', async () => {
    const olds: [object, number[]][] = [[{ ...record(7), record: 3, lairs: [1] }, [1]], [{ ...record(7), record: 2 }, []], [record(7), []]];
    for (const [old, lairs] of olds) {
      const store = memoryStore();
      store.data.set('openworld:7', old);
      const back = await worldSaves(store, 1).load(7);
      expect(back!.discovered).toEqual([]);
      expect(back!.lairs).toEqual(lairs);
    }
  });

  it('keeps a record of this record version whose discovered cells do not decode, with none discovered (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of [undefined, 'x', [[0, 0, '!!']]]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...record(7), record: 4, yaw: 0, lairs: [], discovered: bad });
      expect(await worldSaves(store, 1).load(7)).toMatchObject({ discovered: [], hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('beat keeps the discovered cells', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], discovered());
    await saves.beat(7, 3);
    expect((await saves.load(7))!.discovered).toEqual(discovered());
  });
});

describe('the save of the time of day (#1496)', () => {
  it('saves the time of day with the world and loads it back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 8 * 60_000);
    expect((await saves.load(7))!.time).toBe(8 * 60_000);
  });

  it('loads a record of the record version 4 or before, saved before the cycle, at the start of day: old saves still load', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 4, yaw: 0, lairs: [], discovered: [] });
    expect((await worldSaves(store, 1).load(7))!.time).toBe(0);
    store.data.set('openworld:7', record(7));
    expect((await worldSaves(store, 1).load(7))!.time).toBe(0);
  });

  it('keeps a record of this record version whose time is not inside one cycle, at the start of day (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of ['x', -1, Number.NaN, 12 * 60_000, undefined]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...record(7), record: 5, yaw: 0, lairs: [], discovered: [], time: bad });
      expect(await worldSaves(store, 1).load(7), String(bad)).toMatchObject({ time: 0, hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('beat keeps the time of day', async () => {
    const store = memoryStore();
    const saves = worldSaves(store, 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 9 * 60_000);
    await saves.beat(7, 2);
    expect((await saves.load(7))!.time).toBe(9 * 60_000);
  });
});

describe('the save of the lore logs found (#1589)', () => {
  it('saves the logs found with the world and loads them back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 0, [4, 11]);
    expect((await saves.load(7))!.logs).toEqual([4, 11]);
  });

  it('loads a record of the record version 5 or before, saved before the logs, as none found: old saves still load', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 5, yaw: 0, lairs: [], discovered: [], time: 3 });
    expect((await worldSaves(store, 1).load(7))!.logs).toEqual([]);
    store.data.set('openworld:7', record(7));
    expect((await worldSaves(store, 1).load(7))!.logs).toEqual([]);
  });

  it('keeps a record of this record version whose logs are not a list of log numbers, with none found (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of ['x', undefined, [-1], [1.5], ['a'], [[1]], Array.from({ length: 100_001 }, () => 1)]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...record(7), record: 6, yaw: 0, lairs: [], discovered: [], time: 0, logs: bad });
      expect(await worldSaves(store, 1).load(7), String(bad).slice(0, 20)).toMatchObject({ logs: [], hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('beat and beatMarble keep the logs found', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 0, [2, 9]);
    await saves.beat(7, 2);
    await saves.beatMarble(7, [5, 5]);
    const back = (await saves.load(7))!;
    expect(back.logs).toEqual([2, 9]);
    expect(back.lairs).toEqual([2]);
  });
});

describe('the save of the recruits (#1531)', () => {
  const crowd = (n: number): Axial[] => Array.from({ length: n }, (_, i): Axial => [i, 0]);
  const v6 = { ...record(7), record: 6, yaw: 0, lairs: [], discovered: [], time: 0, logs: [] };

  it('saves the recruits with the world and loads them back, the troop holding the fifteen and the recruits', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, crowd(17), new FightState(), 0, [], [], [], 0, [], 2);
    const back = (await saves.load(7))!;
    expect(back.recruits).toBe(2);
    expect(back.troop).toHaveLength(17);
  });

  it('loads a record of the record version 6 or before, saved before the recruits, as none: old saves still load', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', v6);
    expect((await worldSaves(store, 1).load(7))!.recruits).toBe(0);
    store.data.set('openworld:7', record(7));
    expect((await worldSaves(store, 1).load(7))!.recruits).toBe(0);
  });

  it('keeps a record of this record version whose recruits are not a whole number up to the cap, with none, and one whose troop is longer than 15 and them, with no troop (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad: [unknown, Axial[]][] = [['x', crowd(2)], [undefined, crowd(2)], [-1, crowd(2)], [1.5, crowd(2)], [RECRUIT_MAX + 1, crowd(2)], [0, crowd(16)], [2, crowd(18)]];
    for (const [recruits, troop] of bad) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...v6, record: 7, recruits, troop });
      expect(await worldSaves(store, 1).load(7), String(recruits)).toMatchObject({ recruits: recruits === 2 ? 2 : 0, troop: troop.length > 15 ? [] : troop, hero });
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('keeps a troop of fifteen and the cap as the most a world holds, and a record of version 6 to the fifteen it always held', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...v6, record: 7, recruits: RECRUIT_MAX, troop: crowd(15 + RECRUIT_MAX) });
    expect((await worldSaves(store, 1).load(7))!.troop).toHaveLength(15 + RECRUIT_MAX);
    store.data.set('openworld:7', { ...v6, troop: crowd(16) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await worldSaves(store, 1).load(7))!.troop).toEqual([]);
  });

  it('beat and beatMarble keep the recruits, and on a record of version 6 write a record that still loads', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, crowd(16), new FightState(), 0, [], [], [], 0, [], 1);
    await saves.beat(7, 2);
    await saves.beatMarble(7, [5, 5]);
    const back = (await saves.load(7))!;
    expect(back.recruits).toBe(1);
    expect(back.troop).toHaveLength(16);
    for (const act of [(s: ReturnType<typeof worldSaves>) => s.beat(7, 3), (s: ReturnType<typeof worldSaves>) => s.beatMarble(7, [5, 5])]) {
      const store = memoryStore();
      store.data.set('openworld:7', v6);
      await act(worldSaves(store, 1));
      const after = await worldSaves(store, 1).load(7);
      expect(after, 'a record 6 stays loadable after it is touched').not.toBeNull();
      expect(after!.recruits).toBe(0);
    }
  });
});

describe('the save of the resources and the army (#1655, record 8)', () => {
  const stock = { wood: 12, ore: 7, parts: 20, shards: 2 };
  const army = { specials: [1, 2], brought: [1], relics: [3], relicsBrought: [3] };
  const v7 = { ...record(7), record: 7, yaw: 0, lairs: [], discovered: [], time: 0, logs: [], recruits: 0 };

  it('saves the resources and the army with the world and loads them back', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 0, [], 0, stock, army);
    const back = (await saves.load(7))!;
    expect(back.resources).toEqual(stock);
    expect(back.army).toEqual(army);
  });

  it('writes record 8', async () => {
    const store = memoryStore();
    await worldSaves(store, 1).put(7, hero, troop, new FightState(), 0);
    expect((store.data.get('openworld:7') as { record: number }).record).toBe(8);
  });

  it('loads a record 7 with zero resources and no army: old saves still load', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', v7);
    const back = (await worldSaves(store, 1).load(7))!;
    expect(back.resources).toEqual(NO_RESOURCES);
    expect(back.army).toEqual(NO_ARMY);
  });

  it('keeps a record 8 whose resources or army do not decode, with the other one and the rest kept (#1661)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = { ...v7, record: 8, resources: stock, army };
    for (const bad of [{ resources: undefined }, { resources: { wood: -1, ore: 0, parts: 0, shards: 0 } }, { army: undefined }, { army: { ...army, specials: 'x' } }]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...good, ...bad });
      const back = (await worldSaves(store, 1).load(7))!;
      expect(back.resources, JSON.stringify(bad)).toEqual('resources' in bad ? NO_RESOURCES : stock);
      expect(back.army).toEqual('army' in bad ? NO_ARMY : army);
      expect(back.hero).toEqual(hero);
      expect(store.data.has('openworld:7')).toBe(true);
    }
  });

  it('a lair beaten gives its five shards once, and the marble a wild fight won gives its parts once: a second call farms nothing', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0, [], [], [], 0, [], 0, stock, army);
    await saves.beat(7, 2);
    await saves.beat(7, 2);
    await saves.beatMarble(7, [5, 5]);
    await saves.beatMarble(7, [5, 5]);
    await saves.beatMarble(7, [0, -350]);
    const back = (await saves.load(7))!;
    expect(back.resources).toEqual({ wood: 12, ore: 7, parts: 20 + 3 + 6, shards: 2 + 5 });
    expect(back.army).toEqual(army);
  });

  it('a record 7 touched by beat or beatMarble is written as record 8 with the gain on zero', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', v7);
    await worldSaves(store, 1).beat(7, 1);
    expect((await worldSaves(store, 1).load(7))!.resources).toEqual({ ...NO_RESOURCES, shards: 5 });
    store.data.set('openworld:7', v7);
    await worldSaves(store, 1).beatMarble(7, [5, 5]);
    const back = (await worldSaves(store, 1).load(7))!;
    expect(back.resources).toEqual({ ...NO_RESOURCES, parts: 3 });
    expect(back.army).toEqual(NO_ARMY);
  });
});

describe('the stock the Workshop and a wild fight change (#1655)', () => {
  const stock = { wood: 1, ore: 2, parts: 3, shards: 4 };
  const army = { specials: [1, 9], brought: [9], relics: [], relicsBrought: [] };

  it('replaces the resources and the army of the save, the rest of the world untouched', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 1.5, [[3, 3]], [2]);
    await saves.setStock(7, stock, army);
    const back = (await saves.load(7))!;
    expect([back.resources, back.army]).toEqual([stock, army]);
    expect([back.yaw, back.broken, back.lairs, back.hero]).toEqual([1.5, [[3, 3]], [2], hero]);
  });

  it('writes a record 7 as record 8, and does nothing without a save or when the store fails', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 7, yaw: 0, lairs: [], discovered: [], time: 0, logs: [], recruits: 0 });
    await worldSaves(store, 1).setStock(7, stock, army);
    expect((store.data.get('openworld:7') as { record: number }).record).toBe(8);
    await worldSaves(store, 1).setStock(8, stock, army);
    expect(store.data.has('openworld:8')).toBe(false);
    const broken: KeyStore = { get: async () => Promise.reject(new Error('blocked')), put: async () => Promise.reject(new Error('blocked')), delete: async () => Promise.reject(new Error('blocked')) };
    await expect(worldSaves(broken, 1).setStock(7, stock, army)).resolves.toBeUndefined();
  });
});

describe('worldSaves', () => {
  it('saves a world under its seed and loads it back with its hero, troop and fight', async () => {
    const saves = worldSaves(memoryStore(), 1);
    expect(await saves.put(7, hero, troop, fightWithPush(), 0)).toBe(true);
    const back = await saves.load(7);
    expect(back).toEqual({ ...record(7), broken: [], lairs: [], discovered: [], time: 0, logs: [], recruits: 0, resources: NO_RESOURCES, army: NO_ARMY, savedAt: expect.any(Number) });
    expect(back!.fight.beaten).toBe(1);
  });

  it('keeps one record per seed: a world saved does not replace another', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0);
    await saves.put(8, [4, 4], [], new FightState(), 0);
    expect((await saves.load(7))!.hero).toEqual(hero);
    expect((await saves.load(8))!.hero).toEqual([4, 4]);
    expect(await saves.load(9)).toBeNull();
  });

  it('stores the record in the game store of the ab-alone database, through IndexedDB', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    const saves = worldSaves(indexedDbStore(), 1);
    await saves.put(7, hero, troop, new FightState(), 0);
    expect((await saves.load(7))!.seed).toBe(7);
    expect((await factory.databases()).map(({ name }) => name)).toEqual(['ab-alone']);
  });

  it('remembers the last world played, and the last one wins', async () => {
    const saves = worldSaves(memoryStore(), 1);
    expect(await saves.last()).toBeNull();
    await saves.remember(7);
    await saves.remember(9);
    expect(await saves.last()).toBe(9);
  });

  it('refuses a save of another world version and starts that world fresh, the old one kept aside, not deleted (#1661)', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', record(7, 0));
    expect(await worldSaves(store, 1).load(7)).toBeNull();
    expect(store.data.get('openworld:7:refused')).toEqual(record(7, 0));
  });

  it('refuses a record whose hero or seed is unusable and keeps it aside: the wrong shape, a hero that is not a cell, another seed (#1661)', async () => {
    const garbage: unknown[] = [
      'x',
      null,
      { ...record(7), hero: 'a' },
      { ...record(7), hero: [1] },
      { ...record(7), hero: [1.5, 0] },
      record(8), // the record of another seed under this key
    ];
    for (const raw of garbage) {
      const store = memoryStore();
      store.data.set('openworld:7', raw);
      expect(await worldSaves(store, 1).load(7), JSON.stringify(raw)).toBeNull();
      expect(store.data.get('openworld:7:refused'), JSON.stringify(raw)).toEqual(raw);
      expect(store.data.get('openworld:7'), JSON.stringify(raw)).toEqual(raw); // never deleted
    }
  });

  it('keeps a record whose troop, fight or savedAt is garbage, with those fields at their defaults, and the progress kept (#1661)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const progress = { ...record(7), record: 3, yaw: 0.5, lairs: [4], broken: [[9, 9]] };
    for (const bad of [{ troop: [[0, 0], ['a', 0]] }, { troop: Array.from({ length: 16 }, () => [0, 0]) }, { troop: 'x' }, { fight: null }, { fight: { removed: ['2,0'], added: [], beaten: -1 } }, { savedAt: 'now' }]) {
      const store = memoryStore();
      store.data.set('openworld:7', { ...progress, ...bad });
      const back = (await worldSaves(store, 1).load(7))!;
      expect(back, JSON.stringify(bad)).toMatchObject({ hero, yaw: 0.5, lairs: [4], broken: [[9, 9]] });
      expect(store.data.has('openworld:7:refused'), JSON.stringify(bad)).toBe(false);
      expect(Object.keys(bad).every((field) => warn.mock.calls.some(([line]) => String(line).includes(field)))).toBe(true);
    }
    expect((await worldSaves(memoryStore(), 1).load(7))).toBeNull();
  });

  it('gives the last world only as a seed: a garbage record is no last world', async () => {
    const store = memoryStore();
    store.data.set('openworld:last', { seed: 'seven' });
    expect(await worldSaves(store, 1).last()).toBeNull();
    store.data.set('openworld:last', 7);
    expect(await worldSaves(store, 1).last()).toBeNull();
  });

  it('never throws to the page: a store that fails gives no save, a false put and no last world', async () => {
    const broken: KeyStore = {
      get: async () => Promise.reject(new Error('blocked')),
      put: async () => Promise.reject(new Error('blocked')),
      delete: async () => Promise.reject(new Error('blocked')),
    };
    const saves = worldSaves(broken, 1);
    expect(await saves.load(7)).toBeNull();
    expect(await saves.put(7, hero, troop, new FightState(), 0)).toBe(false);
    await expect(saves.remember(7)).resolves.toBeUndefined();
    expect(await saves.last()).toBeNull();
  });

  it('a stale save that cannot be kept aside is still no save, and no throw', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', record(7, 0));
    store.put = async () => Promise.reject(new Error('full'));
    expect(await worldSaves(store, 1).load(7)).toBeNull();
  });

  it('without IndexedDB at all, every call is a no-op', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const saves = worldSaves(indexedDbStore(), 1);
    expect(await saves.load(7)).toBeNull();
    expect(await saves.put(7, hero, troop, new FightState(), 0)).toBe(false);
    expect(await saves.last()).toBeNull();
  });

  // #1021: the New world control discards the save of the world it leaves; the other seeds' saves stay.
  it('discards the save of the seed given and keeps the other seeds saved', async () => {
    const store = memoryStore();
    const saves = worldSaves(store, 1);
    await saves.put(7, hero, troop, new FightState(), 0);
    await saves.put(8, hero, troop, new FightState(), 0);
    await saves.discard(7);
    expect(store.data.has('openworld:7')).toBe(false);
    expect(store.data.has('openworld:8')).toBe(true);
  });

  it('a storage that refuses the delete keeps the save and throws nothing', async () => {
    const store = memoryStore();
    store.delete = async () => Promise.reject(new Error('blocked'));
    await expect(worldSaves(store, 1).discard(7)).resolves.toBeUndefined();
  });
});
