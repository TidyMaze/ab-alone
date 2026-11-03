import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, blueprintId, CELLS, COLLECT_COST, LEGACY_UNLOCKED, readUnlocked, recordUnlocked } from './collector';

// The Collector's blueprints and where they are kept between runs (#1470, docs/specs/roguelite.md section 15).
const KEY = 'ab-alone.roguelite.blueprints';
const fake = (): { data: Map<string, string>; store: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } } => {
  const data = new Map<string, string>();
  return { data, store: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) } };
};

describe('the blueprints', () => {
  it('are 14, by a stable id: 6 relics, 2 tactics, 6 special marbles of the acts unlocks', () => {
    expect(BLUEPRINTS).toHaveLength(14);
    expect(BLUEPRINTS.slice(0, 6).map((b) => [b.type, b.code])).toEqual([[ 'relic', 6], ['relic', 7], ['relic', 8], ['relic', 9], ['relic', 10], ['relic', 11]]);
    expect(BLUEPRINTS.slice(6, 8).map((b) => [b.type, b.code])).toEqual([['tactic', 3], ['tactic', 4]]);
    expect(BLUEPRINTS.slice(8).map((b) => [b.type, b.code])).toEqual([['special', 2], ['special', 3], ['special', 8], ['special', 10], ['special', 7], ['special', 9]]);
    expect(new Set(BLUEPRINTS.map((b) => `${b.type}${b.code}`)).size).toBe(14);
  });

  it('are found by type and code, -1 for an item every run holds', () => {
    expect(blueprintId('relic', 6)).toBe(0);
    expect(blueprintId('tactic', 4)).toBe(7);
    expect(blueprintId('special', 9)).toBe(13);
    expect(blueprintId('relic', 0)).toBe(-1);
    expect(blueprintId('special', 1)).toBe(-1);
  });

  it('the runs saved before them count the relics and tactics as unlocked, the special marbles by their acts', () => {
    expect(LEGACY_UNLOCKED).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('cost cells: 2 a fight, 4 an elite, 6 an act boss, and 5 to bank one', () => {
    expect(CELLS).toEqual({ fight: 2, elite: 4, boss: 6 });
    expect(COLLECT_COST).toBe(5);
  });
});

describe('the blueprints banked between runs', () => {
  it('are kept in local storage, none before the first, each once', () => {
    const { data, store } = fake();
    expect(readUnlocked(store)).toEqual([]);
    recordUnlocked(store, [3]);
    expect(data.get(KEY)).toBe('[3]');
    recordUnlocked(store, [3, 9]);
    recordUnlocked(store, []);
    expect(readUnlocked(store)).toEqual([3, 9]);
  });

  it('ignore a record that is not a list of blueprint ids, and an id that is none', () => {
    const { data, store } = fake();
    for (const bad of ['x', '{}', '3', '[14]', '[-1]', '[1.5]', '[1,1]', '["1"]', 'null']) {
      data.set(KEY, bad);
      expect(readUnlocked(store)).toEqual([]);
    }
    data.set(KEY, '[2]');
    recordUnlocked(store, [14, -1, 2.5]);
    expect(readUnlocked(store)).toEqual([2]);
  });

  it('are safe when the storage is blocked', () => {
    expect(readUnlocked(null)).toEqual([]);
    expect(() => recordUnlocked(null, [1])).not.toThrow();
  });
});
