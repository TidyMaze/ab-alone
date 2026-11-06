// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyChunk, PLATE_DELAY_MS } from './modechunk';

// The code of a mode loads when the player first enters it (#1578): the Loading plate shows when the load is slow, and a load
// that fails (offline, a new deploy that removed the old file) leaves a message with Retry and Reload, never a dead page.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const click = (id: string): void => byId(id).click();
/** A promise settled by hand, so a test holds a load open. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<div id="loading" hidden class="done"></div>
    <div id="chunk-error" role="alert" hidden><p><span id="chunk-name"></span></p><button id="chunk-retry"></button><button id="chunk-reload"></button></div>`;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('lazyChunk, #1578', () => {
  it('loads once and hands the same module to every caller', async () => {
    const load = vi.fn(async () => ({ id: 1 }));
    const chunk = lazyChunk('Open world', load);
    expect(load).not.toHaveBeenCalled(); // nothing loads until the first entry
    const [a, b] = await Promise.all([chunk(), chunk()]);
    expect(a).toBe(b);
    expect(await chunk()).toBe(a);
    expect(load).toHaveBeenCalledOnce();
  });

  it('shows nothing when the code comes at once', async () => {
    const chunk = lazyChunk('Open world', async () => 1);
    await chunk();
    await vi.advanceTimersByTimeAsync(PLATE_DELAY_MS * 2);
    expect(byId('loading').hidden).toBe(true);
  });

  it('shows the Loading plate once the load is slow and takes it away with the code', async () => {
    const slow = deferred<number>();
    const chunk = lazyChunk('Open world', () => slow.promise);
    const loaded = chunk();
    await vi.advanceTimersByTimeAsync(PLATE_DELAY_MS - 1);
    expect(byId('loading').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(byId('loading').hidden).toBe(false);
    expect(byId('loading').classList.contains('done')).toBe(false); // it was faded before: it shows whole
    slow.resolve(7);
    expect(await loaded).toBe(7);
    expect(byId('loading').hidden).toBe(true);
  });

  it('leaves a plate that was already up to the first frame of the mode', async () => {
    byId('loading').hidden = false; // a page that opens in the world (#1520)
    const slow = deferred<number>();
    const loaded = lazyChunk('Open world', () => slow.promise)();
    await vi.advanceTimersByTimeAsync(PLATE_DELAY_MS);
    slow.resolve(1);
    await loaded;
    expect(byId('loading').hidden).toBe(false);
  });

  it('shows the message with the name of the mode when the load fails, and no plate over it', async () => {
    const slow = deferred<number>();
    const chunk = lazyChunk('Open world', () => slow.promise);
    void chunk();
    await vi.advanceTimersByTimeAsync(PLATE_DELAY_MS);
    slow.reject(new Error('Failed to fetch dynamically imported module'));
    await vi.advanceTimersByTimeAsync(0);
    expect(byId('chunk-error').hidden).toBe(false);
    expect(byId('chunk-name').textContent).toBe('Open world');
    expect(byId('loading').hidden).toBe(true);
  });

  it('Retry loads again, hides the message and answers the first caller', async () => {
    let online = false;
    const load = vi.fn(async () => {
      if (!online) throw new Error('offline');
      return 'code';
    });
    const chunk = lazyChunk('Open world', load);
    const first = chunk();
    await vi.advanceTimersByTimeAsync(0);
    expect(byId('chunk-error').hidden).toBe(false);
    online = true;
    click('chunk-retry');
    expect(await first).toBe('code');
    expect(byId('chunk-error').hidden).toBe(true);
    expect(await chunk()).toBe('code'); // kept
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the message when Retry fails again', async () => {
    const chunk = lazyChunk('Open world', async () => {
      throw new Error('offline');
    });
    void chunk();
    await vi.advanceTimersByTimeAsync(0);
    click('chunk-retry');
    await vi.advanceTimersByTimeAsync(0);
    expect(byId('chunk-error').hidden).toBe(false);
  });

  it('a second entry while the message is up waits for the same Retry', async () => {
    let online = false;
    const load = vi.fn(async () => {
      if (!online) throw new Error('offline');
      return 'code';
    });
    const chunk = lazyChunk('Open world', load);
    const first = chunk();
    await vi.advanceTimersByTimeAsync(0);
    const second = chunk();
    online = true;
    click('chunk-retry');
    expect(await Promise.all([first, second])).toEqual(['code', 'code']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Reload reloads the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    void lazyChunk('Open world', async () => {
      throw new Error('offline');
    })();
    await vi.advanceTimersByTimeAsync(0);
    click('chunk-reload');
    expect(reload).toHaveBeenCalledOnce();
  });
});
