import { describe, expect, it } from 'vitest';
import {
  GENESIS,
  generateKeys,
  hashRecord,
  loadKeys,
  parseRecord,
  signMove,
  verifyRecord,
} from './moverecord';

const MOVE = [1, 0, 0, 2, 0, 0, 0, 0];

describe('signMove / verifyRecord', () => {
  it('signs a move and verifies it', async () => {
    const keys = await generateKeys();
    const rec = await signMove(keys, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    expect(rec).toMatchObject({ game: 'g', seq: 0, prev: GENESIS, move: MOVE, pub: keys.pub });
    expect(await verifyRecord(rec)).toBe(true);
  });

  it('refuses a tampered move, seq, prev or game', async () => {
    const keys = await generateKeys();
    const rec = await signMove(keys, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    expect(await verifyRecord({ ...rec, move: [1, 0, 0, 3, 0, 0, 0, 0] })).toBe(false);
    expect(await verifyRecord({ ...rec, seq: 1 })).toBe(false);
    expect(await verifyRecord({ ...rec, prev: 'ab'.repeat(32) })).toBe(false);
    expect(await verifyRecord({ ...rec, game: 'other' })).toBe(false);
  });

  it('refuses a signature made by another key', async () => {
    const a = await generateKeys();
    const b = await generateKeys();
    const rec = await signMove(a, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    expect(await verifyRecord({ ...rec, pub: b.pub })).toBe(false);
  });

  it('refuses garbage key or signature bytes instead of throwing', async () => {
    const keys = await generateKeys();
    const rec = await signMove(keys, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    expect(await verifyRecord({ ...rec, pub: 'AAAA' })).toBe(false);
    expect(await verifyRecord({ ...rec, sig: '!!!' })).toBe(false);
  });
});

describe('hashRecord', () => {
  it('is a 64 char hex string, stable, and covers the signature', async () => {
    const keys = await generateKeys();
    const rec = await signMove(keys, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    const h = await hashRecord(rec);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashRecord({ ...rec })).toBe(h);
    expect(await hashRecord({ ...rec, sig: 'AAAA' })).not.toBe(h);
    expect(await hashRecord({ ...rec, move: [2, 0, 0, 2, 0, 0, 0, 0] })).not.toBe(h);
  });
});

describe('parseRecord', () => {
  const good = { game: 'g', seq: 0, prev: GENESIS, move: MOVE, pub: 'k', sig: 's' };

  it('accepts a well formed record', () => {
    expect(parseRecord(good)).toEqual(good);
  });

  it('refuses anything else', () => {
    for (const bad of [
      null,
      'x',
      42,
      {},
      { ...good, game: 1 },
      { ...good, seq: -1 },
      { ...good, seq: 1.5 },
      { ...good, prev: 3 },
      { ...good, move: 'm' },
      { ...good, move: [1, 'a'] },
      { ...good, pub: 3 },
      { ...good, sig: 3 },
    ]) {
      expect(parseRecord(bad)).toBeNull();
    }
  });

  it('drops unknown fields', () => {
    expect(parseRecord({ ...good, extra: 1 })).toEqual(good);
  });
});

describe('loadKeys', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('creates keys once, then reloads the same ones', async () => {
    const store = memory();
    const first = await loadKeys(store);
    const second = await loadKeys(store);
    expect(second.pub).toBe(first.pub);
    const rec = await signMove(second, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    expect(await verifyRecord(rec)).toBe(true);
  });

  it('makes fresh keys when the stored value is garbage', async () => {
    const store = memory();
    store.setItem('ab-alone.keys', 'not json');
    const keys = await loadKeys(store);
    expect(keys.pub).toMatch(/^[\w-]+$/);
    expect(JSON.parse(store.getItem('ab-alone.keys')!).pub).toBe(keys.pub);
  });

  it('works with no storage at all', async () => {
    expect((await loadKeys(null)).pub).toMatch(/^[\w-]+$/);
  });
});
