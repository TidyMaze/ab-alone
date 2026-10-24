// IndexedDB behind the KeyStore interface, see docs/specs/tech.md section 8. Browser only: the unit tests
// use memoryStore, the e2e tests (resume.spec.ts) cover this file in a real browser. Nothing leaves the browser.

import type { KeyStore } from './savegame';

const DB_NAME = 'ab-alone';
const DB_VERSION = 1;
const GAMES = 'game'; // object store of saved games, out-of-line keys

/** The `game` object store of the `ab-alone` database. Every call rejects when IndexedDB is missing or blocked. */
export function indexedDbStore(): KeyStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION); // a throw here (no IndexedDB) rejects
      req.onupgradeneeded = () => req.result.createObjectStore(GAMES);
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close(); // never block a newer page that upgrades it
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    }));
  const run = async (mode: IDBTransactionMode, op: (games: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    const tx = (await open()).transaction(GAMES, mode);
    const req = op(tx.objectStore(GAMES));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (games) => games.get(key)),
    put: async (key, value) => void (await run('readwrite', (games) => games.put(value, key))),
    delete: async (key) => void (await run('readwrite', (games) => games.delete(key))),
  };
}
