import { describe, expect, it } from 'vitest';
import { collectedLogs, markCollected, markRead, readLore } from './lorestore';

// The lore entries read (#512) and the audio logs collected (#517), saved locally for the log archive of
// docs/specs/world.md section 4.
const memory = (): Storage => {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};

describe('lorestore', () => {
  it('reads nothing when nothing was read, or the store is empty or blocked', () => {
    expect(readLore(memory())).toEqual([]);
    const empty = memory();
    empty.setItem('ab-alone.lore-read', '');
    expect(readLore(empty)).toEqual([]);
    expect(readLore(null)).toEqual([]);
  });

  it('saves each entry read once, in the order first read', () => {
    const store = memory();
    markRead(store, 'mess-house-rule');
    markRead(store, 'cargo-assay');
    markRead(store, 'mess-house-rule');
    expect(readLore(store)).toEqual(['mess-house-rule', 'cargo-assay']);
    expect(store.getItem('ab-alone.lore-read')).toBe('mess-house-rule,cargo-assay');
  });

  it('reads nothing back, without throwing, when the storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    markRead(blocked, 'mess-house-rule');
    expect(readLore(blocked)).toEqual([]);
  });

  it('saves each audio log collected once, in the order first collected, apart from the entries read', () => {
    const store = memory();
    expect(collectedLogs(store)).toEqual([]);
    markCollected(store, 'mess-first-game');
    markCollected(store, 'bridge-crew-count');
    markCollected(store, 'mess-first-game');
    expect(collectedLogs(store)).toEqual(['mess-first-game', 'bridge-crew-count']);
    expect(store.getItem('ab-alone.logs-collected')).toBe('mess-first-game,bridge-crew-count');
    expect(readLore(store)).toEqual([]);
  });
});
