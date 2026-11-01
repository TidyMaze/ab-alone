import { describe, expect, it } from 'vitest';
import { claimOnce, medalCount } from './openworldledger';
import type { Store } from './quality';

const memory = (initial: Record<string, string> = {}): Store => {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
};

describe('the Open world ledger (#1171)', () => {
  it('counts the roster bosses that have a medal in ab-alone.medals', () => {
    const store = memory({ 'ab-alone.medals': JSON.stringify({ echo: 9, hull: 12, nobody: 3 }) });
    expect(medalCount(store, ['echo', 'hull', 'choir'])).toBe(2);
    expect(medalCount(memory(), ['echo'])).toBe(0);
    expect(medalCount(null, ['echo'])).toBe(0);
  });

  it("says Tally's claim line once: true the first time, false after, true on every visit with no storage", () => {
    const store = memory();
    expect(claimOnce(store)).toBe(true);
    expect(claimOnce(store)).toBe(false);
    expect(claimOnce(store)).toBe(false);
    expect(claimOnce(null)).toBe(true); // no storage: said on every visit rather than never
  });
});
