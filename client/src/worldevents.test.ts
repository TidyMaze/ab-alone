// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BreakSet, MAX_HELD, signBreak, verifyBreak, worldKeys } from './worldevents';
import type { BreakEvent } from './worldpeers';
import { generateKeys } from './moverecord';

const ev = (q: number, r = 0): BreakEvent => ({ seed: 1305, q, r, pub: 'k', sig: 's' });

describe('a signed break', () => {
  it('verifies, and fails as soon as the seed, the cell or the key is changed', async () => {
    const keys = await generateKeys();
    const e = await signBreak(keys, 1305, 4, -9);
    expect(e).toMatchObject({ seed: 1305, q: 4, r: -9, pub: keys.pub });
    expect(await verifyBreak(e)).toBe(true);
    expect(await verifyBreak({ ...e, q: 5 })).toBe(false);
    expect(await verifyBreak({ ...e, r: -8 })).toBe(false);
    expect(await verifyBreak({ ...e, seed: 7 })).toBe(false);
    expect(await verifyBreak({ ...e, pub: (await generateKeys()).pub })).toBe(false);
    expect(await verifyBreak({ ...e, sig: 'not a signature' })).toBe(false);
    expect(await verifyBreak({ ...e, pub: '!' })).toBe(false);
  });
});

describe('worldKeys', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('makes a key once, keeps it in the store and reads the same one back', async () => {
    const store = memory();
    const first = await worldKeys(store);
    expect(store.data.get('ab-alone.world-key')).toBeDefined();
    const again = await worldKeys(store);
    expect(again.pub).toBe(first.pub);
    expect(await verifyBreak(await signBreak(again, 1305, 1, 1))).toBe(true);
    expect((await signBreak(first, 1305, 1, 1)).pub).toBe(again.pub);
  });

  it('makes a new key when the stored one is broken, or when there is no store', async () => {
    const store = memory();
    store.data.set('ab-alone.world-key', 'garbage');
    const fixed = await worldKeys(store);
    expect(fixed.pub).toHaveLength(43);
    expect(JSON.parse(store.data.get('ab-alone.world-key')!).pub).toBe(fixed.pub);
    store.data.set('ab-alone.world-key', JSON.stringify({ priv: 'AAAA', pub: fixed.pub }));
    expect((await worldKeys(store)).pub).not.toBe(fixed.pub);
    const first = JSON.parse(store.data.get('ab-alone.world-key')!) as { priv: string; pub: string };
    const other = await worldKeys(memory());
    store.data.set('ab-alone.world-key', JSON.stringify({ priv: first.priv, pub: other.pub })); // a private key with another's public one
    expect((await worldKeys(store)).pub).not.toBe(other.pub);
    expect((await worldKeys(null)).pub).toHaveLength(43);
  });
});

describe('BreakSet, the grow-only set of what was broken', () => {
  it('holds a cell once, whoever broke it', () => {
    const set = new BreakSet();
    expect(set.has(1, 2)).toBe(false);
    expect(set.add(ev(1, 2))).toBe(true);
    expect(set.has(1, 2)).toBe(true);
    expect(set.add({ ...ev(1, 2), pub: 'other' })).toBe(false);
    expect(set.size).toBe(1);
  });

  it('gives the newest first, at most the number asked', () => {
    const set = new BreakSet();
    for (let q = 0; q < 5; q++) set.add(ev(q));
    expect(set.newest(3).map((e) => e.q)).toEqual([4, 3, 2]);
    expect(set.newest(99).map((e) => e.q)).toEqual([4, 3, 2, 1, 0]);
  });

  it('drops the oldest past MAX_HELD, and empties', () => {
    const set = new BreakSet();
    for (let q = 0; q < MAX_HELD + 3; q++) set.add(ev(q));
    expect(set.size).toBe(MAX_HELD);
    expect(set.has(0, 0)).toBe(false);
    expect(set.has(3, 0)).toBe(true);
    set.clear();
    expect(set.size).toBe(0);
  });
});
