// IndexedDB behind the KeyStore interface, see docs/specs/tech.md section 8. idb.test.ts runs it on fake-indexeddb,
// the e2e test resume.spec.ts in a real browser. Nothing leaves the browser.

import type { KeyStore } from './savegame';

const DB_NAME = 'ab-alone';
const GAMES = 'game'; // object store of saved games, out-of-line keys

/** The `game` object store of the `ab-alone` database. Every call rejects when IndexedDB is missing or blocked.
 * The connection is kept, and forgotten when it closes under the store (a newer page upgraded the database, the browser closed it) or an
 * operation fails: the call is then tried once more on a fresh connection (#1661), so a closed connection never fails every later call.
 * The database is opened at whatever version is there: an upgrade by a newer page is no failure. */
export function indexedDbStore(): KeyStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME); // a throw here (no IndexedDB) rejects; a new database is version 1
      req.onupgradeneeded = () => req.result.createObjectStore(GAMES);
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close(); // never block a newer page that upgrades it
          db = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    }));
  const once = async (mode: IDBTransactionMode, op: (games: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    const tx = (await open()).transaction(GAMES, mode);
    const req = op(tx.objectStore(GAMES));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  };
  const run = async (mode: IDBTransactionMode, op: (games: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    try {
      return await once(mode, op);
    } catch {
      db = null; // a closed or failed connection: forget it and try again once
      return once(mode, op);
    }
  };
  return {
    get: (key) => run('readonly', (games) => games.get(key)),
    put: async (key, value) => void (await run('readwrite', (games) => games.put(value, key))),
    delete: async (key) => void (await run('readwrite', (games) => games.delete(key))),
  };
}
