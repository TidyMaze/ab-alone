// @vitest-environment jsdom
import { IDBDatabase, IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { boot } from './test/harness';

// A press before the page has finished booting (#1628): main.ts awaits its saved game before it declares the online
// session, so a refresh that runs in that window must not read the session before its declaration.

describe('main.ts before boot ends (#1628)', () => {
  it('a Flat HUD press while the saved game loads turns the toggle on and throws nothing', async () => {
    const errors: string[] = [];
    const onError = (event: ErrorEvent): void => void errors.push(event.message);
    addEventListener('error', onError);
    onTestFinished(() => removeEventListener('error', onError));

    // The page opens its saved game on its first await: the press lands inside that await, before main.ts is past its
    // top-level awaits.
    const indexedDB = new IDBFactory();
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      document.getElementById('setting-flat-hud')!.click();
      return open(...args);
    }) as IDBFactory['open'];

    await boot('/', { indexedDB });

    expect(errors).toEqual([]);
    expect(document.getElementById('setting-flat-hud')!.getAttribute('aria-pressed')).toBe('true');
  });

  // The browser checks load a run through __run as soon as the hook exists (#1625): the hook is set before the page's last
  // await (the public world's save), so a run loaded in that await was replaced by the run the page had read before it.
  it('a run loaded by the test hook while the page still boots is the run shown, not the one saved before', async () => {
    const indexedDB = new IDBFactory();
    const run = { seed: 3, army: 14, path: [0], fighting: true, moves: [] as number[][], end: '', specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [], reward: false };
    const first = await boot('?bot=off', { indexedDB });
    await first.hook<Promise<void>>('__run', run); // the saved run the next page reads first: no move played
    Reflect.deleteProperty(globalThis, '__run');

    // The next page's first transaction once the hook is set: the hook loads a run with one ply, and that transaction is
    // held until the hook is done (or 100 ms, so a hook that waits for the boot does not wait on itself), as a slow disk does.
    const transaction = IDBDatabase.prototype.transaction;
    let loading: Promise<void> | null = null;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = transaction.apply(this, args);
      const hook = (globalThis as { __run?: (r: object) => Promise<void> }).__run;
      if (loading || !hook) return tx;
      loading = hook({ ...run, moves: [[1, 2, -4, 3, 0, 0, 0, 0]] });
      const held = Promise.race([loading, new Promise((done) => setTimeout(done, 100))]);
      let complete: ((e: Event) => void) | null = null;
      Object.defineProperty(tx, 'oncomplete', { get: () => complete, set: (f: (e: Event) => void) => (complete = (e) => void held.then(() => f(e))) });
      return tx;
    });

    const page = await boot('?bot=off', { indexedDB });
    await loading;
    expect(page.hook('__plies')).toBe(1);
  });
});
