import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { indexedDbStore } from './idb';
import { FightState } from './openworldfight';
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

  it('discards a record of a record version this build does not know, a later one', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 3, yaw: 0 });
    expect(await worldSaves(store, 1).load(7)).toBeNull();
    expect(store.data.has('openworld:7')).toBe(false);
  });

  it('discards a record of this record version whose yaw is not a number', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', { ...record(7), record: 2, yaw: 'x' });
    expect(await worldSaves(store, 1).load(7)).toBeNull();
    expect(store.data.has('openworld:7')).toBe(false);
  });
});

describe('worldSaves', () => {
  it('saves a world under its seed and loads it back with its hero, troop and fight', async () => {
    const saves = worldSaves(memoryStore(), 1);
    expect(await saves.put(7, hero, troop, fightWithPush(), 0)).toBe(true);
    const back = await saves.load(7);
    expect(back).toEqual({ ...record(7), savedAt: expect.any(Number) });
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

  it('discards a save of another world version and starts that world fresh', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', record(7, 0));
    expect(await worldSaves(store, 1).load(7)).toBeNull();
    expect(store.data.has('openworld:7')).toBe(false);
  });

  it('discards a garbage record: the wrong shape, cells that are not integers, too many marbles, another seed', async () => {
    const garbage: unknown[] = [
      'x',
      null,
      { ...record(7), hero: 'a' },
      { ...record(7), hero: [1] },
      { ...record(7), hero: [1.5, 0] },
      { ...record(7), troop: [[0, 0], ['a', 0]] },
      { ...record(7), troop: Array.from({ length: 7 }, () => [0, 0]) }, // more than the troop
      { ...record(7), troop: 'x' },
      { ...record(7), fight: null },
      { ...record(7), fight: { removed: ['2,0'], added: [], beaten: -1 } },
      { ...record(7), savedAt: 'now' },
      record(8), // the record of another seed under this key
    ];
    for (const raw of garbage) {
      const store = memoryStore();
      store.data.set('openworld:7', raw);
      expect(await worldSaves(store, 1).load(7), JSON.stringify(raw)).toBeNull();
      expect(store.data.has('openworld:7'), JSON.stringify(raw)).toBe(false);
    }
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

  it('a stale save that cannot be deleted is still no save, and no throw', async () => {
    const store = memoryStore();
    store.data.set('openworld:7', record(7, 0));
    store.delete = async () => Promise.reject(new Error('full'));
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
