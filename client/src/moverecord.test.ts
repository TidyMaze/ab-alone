import { describe, expect, it } from 'vitest';
import {
  GENESIS,
  generateKeys,
  hashRecord,
  parseHello,
  parseMissed,
  parseRecord,
  parseRematch,
  parseSync,
  signHello,
  signMove,
  signRematch,
  verifyHello,
  verifyRecord,
  verifyRematch,
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

describe('Hello', () => {
  it('signs a seat request and verifies it', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 2, roster: [] });
    expect(h).toMatchObject({ kind: 'hello', game: 'g', seat: 2, roster: [], pub: keys.pub });
    expect(await verifyHello(h)).toBe(true);
  });

  it('refuses a tampered seat, roster, game or key, and garbage bytes', async () => {
    const a = await generateKeys();
    const b = await generateKeys();
    const h = await signHello(a, { game: 'g', seat: 2, roster: [] });
    expect(await verifyHello({ ...h, seat: 1 })).toBe(false);
    expect(await verifyHello({ ...h, roster: [b.pub] })).toBe(false);
    expect(await verifyHello({ ...h, game: 'other' })).toBe(false);
    expect(await verifyHello({ ...h, pub: b.pub })).toBe(false);
    expect(await verifyHello({ ...h, pub: 'AAAA' })).toBe(false);
  });

  it('is not a move record: its signature does not verify as one', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 1, roster: [] });
    expect(parseRecord(h)).toBeNull();
  });

  it('parses a clean copy and rejects every wrong shape', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 2, roster: [keys.pub, ''] });
    expect(parseHello({ ...h, extra: 1 })).toEqual(h);
    for (const bad of [
      null,
      'x',
      { ...h, kind: 'move' },
      { ...h, game: 1 },
      { ...h, seat: 0 },
      { ...h, seat: 1.5 },
      { ...h, roster: 'a' },
      { ...h, roster: [1] },
      { ...h, pub: 1 },
      { ...h, sig: 1 },
    ]) {
      expect(parseHello(bad)).toBeNull();
    }
  });
});

describe('Rematch', () => {
  it('signs a rematch ask bound to the finished game and verifies it', async () => {
    const keys = await generateKeys();
    const r = await signRematch(keys, { game: 'g' });
    expect(r).toMatchObject({ kind: 'rematch', game: 'g', pub: keys.pub });
    expect(await verifyRematch(r)).toBe(true);
  });

  it('refuses a tampered game or key, garbage bytes, and a Hello signature', async () => {
    const a = await generateKeys();
    const b = await generateKeys();
    const r = await signRematch(a, { game: 'g' });
    expect(await verifyRematch({ ...r, game: 'other' })).toBe(false);
    expect(await verifyRematch({ ...r, pub: b.pub })).toBe(false);
    expect(await verifyRematch({ ...r, pub: 'AAAA' })).toBe(false);
    expect(await verifyRematch({ ...r, sig: '!!!' })).toBe(false);
    const h = await signHello(a, { game: 'g', seat: 1, roster: [] });
    expect(await verifyRematch({ ...r, sig: h.sig })).toBe(false);
  });

  it('parses a clean copy and rejects every wrong shape', async () => {
    const keys = await generateKeys();
    const r = await signRematch(keys, { game: 'g' });
    expect(parseRematch({ ...r, extra: 1 })).toEqual(r);
    for (const bad of [null, 'x', { ...r, kind: 'hello' }, { ...r, game: 1 }, { ...r, pub: 1 }, { ...r, sig: 1 }]) {
      expect(parseRematch(bad)).toBeNull();
    }
    expect(parseRecord(r)).toBeNull();
    expect(parseHello(r)).toBeNull();
  });
});

describe('Sync and Missed, #226', () => {
  it('parses a clean Sync and rejects every wrong shape', () => {
    const s = { kind: 'sync', game: 'g', seq: 3, asked: ['k'] } as const;
    expect(parseSync({ ...s, extra: 1 })).toEqual(s);
    expect(parseSync({ ...s, seq: 0, asked: [] })).toEqual({ ...s, seq: 0, asked: [] });
    for (const bad of [
      null,
      'x',
      { ...s, kind: 'hello' },
      { ...s, game: 1 },
      { ...s, seq: -1 },
      { ...s, seq: 1.5 },
      { ...s, asked: 'k' },
      { ...s, asked: [1] },
    ]) {
      expect(parseSync(bad)).toBeNull();
    }
    expect(parseRecord(s)).toBeNull();
    expect(parseRematch(s)).toBeNull();
  });

  it('parses a Missed record or ask as a clean copy, and nothing else inside it', async () => {
    const keys = await generateKeys();
    const rec = await signMove(keys, { game: 'g', seq: 0, prev: GENESIS, move: MOVE });
    const ask = await signRematch(keys, { game: 'g' });
    const hello = await signHello(keys, { game: 'g', seat: 1, roster: [] });
    expect(parseMissed({ kind: 'missed', of: { ...rec, extra: 1 }, extra: 1 })).toEqual({ kind: 'missed', of: rec });
    expect(parseMissed({ kind: 'missed', of: ask })).toEqual({ kind: 'missed', of: ask });
    for (const bad of [
      null,
      'x',
      { kind: 'sync', of: rec },
      { kind: 'missed' },
      { kind: 'missed', of: hello },
      { kind: 'missed', of: { kind: 'sync', game: 'g', seq: 0, asked: [] } },
      { kind: 'missed', of: { kind: 'missed', of: rec } },
      { kind: 'missed', of: { ...rec, seq: -1 } },
    ]) {
      expect(parseMissed(bad)).toBeNull();
    }
  });
});
