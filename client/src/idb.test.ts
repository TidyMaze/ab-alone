import { IDBDatabase, IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexedDbStore } from './idb';

// A fresh in-memory IndexedDB per test (fake-indexeddb), in place of the browser's.
const fresh = (): IDBFactory => {
  const factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  return factory;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('indexedDbStore', () => {
  it('puts, gets and deletes a value under its key in the game store of the ab-alone database', async () => {
    const factory = fresh();
    const store = indexedDbStore();
    expect(await store.get('current')).toBeUndefined();
    await store.put('current', { moves: [[1, 2]] });
    expect(await store.get('current')).toEqual({ moves: [[1, 2]] });
    expect((await factory.databases()).map(({ name, version }) => [name, version])).toEqual([['ab-alone', 1]]);
    await store.delete('current');
    expect(await store.get('current')).toBeUndefined();
  });

  it('opens the database once for every call', async () => {
    fresh();
    const open = vi.spyOn(indexedDB, 'open');
    const store = indexedDbStore();
    await store.put('a', 1);
    await store.get('a');
    expect(open).toHaveBeenCalledOnce();
  });

  it('closes its connection when a newer page upgrades the database, so it never blocks it', async () => {
    const factory = fresh();
    await indexedDbStore().put('a', 1);
    const upgrade = await new Promise<string>((resolve, reject) => {
      const req = factory.open('ab-alone', 2);
      req.onblocked = () => reject(new Error('blocked'));
      req.onsuccess = () => {
        req.result.close();
        resolve('upgraded');
      };
    });
    expect(upgrade).toBe('upgraded');
  });

  it('rejects every call when IndexedDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(indexedDbStore().get('a')).rejects.toThrow(TypeError);
  });

  it('rejects when the database cannot be opened: a newer version is already there', async () => {
    const factory = fresh();
    await new Promise<void>((resolve) => {
      const req = factory.open('ab-alone', 3);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    await expect(indexedDbStore().get('a')).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('rejects when the transaction aborts', async () => {
    fresh();
    const store = indexedDbStore();
    await store.get('a'); // opened first: the abort below must hit the store's own transaction, not the upgrade
    const transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      const tx = transaction.apply(this, args);
      queueMicrotask(() => tx.abort());
      return tx;
    });
    await expect(store.put('a', 1)).rejects.toBeNull(); // an abort by hand has no error
  });
});
