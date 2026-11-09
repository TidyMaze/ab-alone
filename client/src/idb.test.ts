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

  // #1661: a connection that closed (a newer page upgraded the database, or the browser closed it) must not leave every later call failing.
  it('keeps working after a newer page upgraded the database: the connection it closed is opened again, and the data is kept', async () => {
    const factory = fresh();
    const store = indexedDbStore();
    await store.put('a', 1);
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('ab-alone', 2);
      req.onblocked = () => reject(new Error('blocked'));
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    expect(await store.get('a')).toBe(1);
    await store.put('b', 2);
    expect(await store.get('b')).toBe(2);
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
  });

  it('retries once on a fresh connection when its connection is closed under it', async () => {
    fresh();
    const store = indexedDbStore();
    await store.put('a', 1);
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('The database connection is closing.', 'InvalidStateError');
    });
    expect(await store.get('a')).toBe(1);
  });

  it('retries once when the database fails to open, and rejects when it fails twice', async () => {
    fresh();
    const store = indexedDbStore();
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await store.put('a', 1);
    expect(await store.get('a')).toBe(1);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens whatever version of the database is there, so an upgraded one is not a failure', async () => {
    const factory = fresh();
    await new Promise<void>((resolve) => {
      const req = factory.open('ab-alone', 3);
      req.onupgradeneeded = () => req.result.createObjectStore('game');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    const store = indexedDbStore();
    await store.put('a', 1);
    expect(await store.get('a')).toBe(1);
  });

  it('rejects with the error of a database that cannot be opened, after trying twice', async () => {
    const error = new DOMException('blocked by the browser', 'UnknownError');
    const open = vi.fn(() => {
      const req = { error } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => req.onerror!(new Event('error')));
      return req;
    });
    vi.stubGlobal('indexedDB', { open });
    await expect(indexedDbStore().get('a')).rejects.toBe(error);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('rejects when the database has no game store', async () => {
    const factory = fresh();
    await new Promise<void>((resolve) => {
      const req = factory.open('ab-alone', 3);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    await expect(indexedDbStore().get('a')).rejects.toMatchObject({ name: 'NotFoundError' });
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
