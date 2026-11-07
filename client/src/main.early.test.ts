// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, onTestFinished } from 'vitest';
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
});
