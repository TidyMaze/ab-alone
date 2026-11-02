// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { BreakSet, EVENTS_KEY, MAX_HELD } from './worldevents';
import type { BreakEvent } from './worldpeers';

const ev = (q: number, r = 0): BreakEvent => ({ kind: 'break', seed: 1305, q, r, pub: 'k', sig: 's' });

describe('BreakSet saved in the store (#1305)', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };
  const saved = (store: ReturnType<typeof memory>) => JSON.parse(store.data.get(EVENTS_KEY)!) as { v: number; events: BreakEvent[] };

  it('saves the set under a v1 record on each add, and a new set reads it back in order, without writing', () => {
    const store = memory();
    const set = new BreakSet(store);
    set.add(ev(1));
    set.add(ev(2));
    set.add(ev(2)); // a cell already held is not a new write
    expect(saved(store).v).toBe(1);
    expect(saved(store).events.map((e) => e.q)).toEqual([1, 2]);
    const writes = vi.spyOn(store, 'setItem');
    expect(new BreakSet(store).stored(1305).map((e) => e.q)).toEqual([1, 2]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('keeps the saved set when the memory is cleared on leaving, and a later add keeps the old events', () => {
    const store = memory();
    const set = new BreakSet(store);
    set.add(ev(1));
    set.clear();
    expect(saved(store).events.map((e) => e.q)).toEqual([1]);
    set.add(ev(2)); // added before the saved events were loaded: the record keeps both
    expect(saved(store).events.map((e) => e.q)).toEqual([1, 2]);
  });

  it('reads only the events of the seed and of a good shape, and nothing from a broken or other-version record', () => {
    const store = memory();
    const set = new BreakSet(store);
    expect(set.stored(1305)).toEqual([]); // no record
    const good = ev(1);
    store.data.set(EVENTS_KEY, JSON.stringify({ v: 1, events: [good, { ...ev(2), seed: 7 }, { ...ev(3), kind: 'x' }, { q: 'a' }, null, { ...ev(4), pub: 5 }, ev(5)] }));
    expect(set.stored(1305).map((e) => e.q)).toEqual([1, 5]);
    store.data.set(EVENTS_KEY, JSON.stringify({ v: 2, events: [good] }));
    expect(set.stored(1305)).toEqual([]);
    store.data.set(EVENTS_KEY, JSON.stringify({ v: 1, events: 'no' }));
    expect(set.stored(1305)).toEqual([]);
    store.data.set(EVENTS_KEY, 'garbage');
    expect(set.stored(1305)).toEqual([]);
    set.add(ev(9)); // a broken record is replaced
    expect(saved(store).events.map((e) => e.q)).toEqual([9]);
  });

  it('drops the oldest saved events on a quota error and goes on, then gives up when nothing fits', () => {
    const data = new Map<string, string>();
    let room = 3;
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if ((JSON.parse(v) as { events: unknown[] }).events.length > room) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
    };
    const set = new BreakSet(store);
    for (let q = 1; q <= 5; q++) set.add(ev(q));
    expect((JSON.parse(data.get(EVENTS_KEY)!) as { events: BreakEvent[] }).events.map((e) => e.q)).toEqual([3, 4, 5]);
    expect(set.size).toBe(5); // the memory keeps all
    room = -1; // nothing fits
    expect(set.add(ev(6))).toBe(true);
  });

  it('goes on in memory with no store, a store that refuses to read, or one that refuses to write', () => {
    const none = new BreakSet(null);
    expect(none.add(ev(1))).toBe(true);
    expect(none.stored(1305)).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const set = new BreakSet(broken);
    expect(set.add(ev(1))).toBe(true);
    expect(set.stored(1305)).toEqual([]);
    expect(set.has(1, 0)).toBe(true);
  });

  it('keeps at most MAX_HELD saved events, the newest', () => {
    const store = memory();
    const set = new BreakSet(store);
    set.adopt(Array.from({ length: MAX_HELD + 2 }, (_, q) => ev(q)));
    expect(saved(store).events).toHaveLength(MAX_HELD);
    expect(saved(store).events[0]!.q).toBe(2);
  });
});
