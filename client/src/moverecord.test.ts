import { describe, expect, it } from 'vitest';
import {
  GENESIS,
  generateKeys,
  hashRecord,
  parseCoordinator,
  parseHello,
  parseMissed,
  parseRecord,
  parseRematch,
  parseSync,
  signCoordinator,
  signHello,
  signMove,
  signRematch,
  verifyCoordinator,
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

  it('signs the agent flag and verifies it, and a Hello without it stays a human one', async () => {
    const keys = await generateKeys();
    const agent = await signHello(keys, { game: 'g', seat: 2, roster: [], agent: true });
    expect(agent).toMatchObject({ agent: true });
    expect(await verifyHello(agent)).toBe(true);
    const human = await signHello(keys, { game: 'g', seat: 2, roster: [] });
    expect(human.agent).toBeUndefined();
    expect(await verifyHello(human)).toBe(true);
  });

  it('refuses a tampered agent flag: added to a human Hello, or removed from an agent one', async () => {
    const keys = await generateKeys();
    const human = await signHello(keys, { game: 'g', seat: 2, roster: [] });
    const agent = await signHello(keys, { game: 'g', seat: 2, roster: [], agent: true });
    expect(await verifyHello({ ...human, agent: true })).toBe(false);
    expect(await verifyHello({ ...agent, agent: undefined })).toBe(false);
  });

  it('parses the agent flag only as true, and refuses any other value', async () => {
    const keys = await generateKeys();
    const agent = await signHello(keys, { game: 'g', seat: 2, roster: [], agent: true });
    expect(parseHello(agent)).toEqual(agent);
    expect(parseHello({ ...agent, agent: false })).toBeNull();
    expect(parseHello({ ...agent, agent: 'yes' })).toBeNull();
  });

  it('signs the engine version, parses it back, and refuses a changed or removed one, #526', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 2, roster: [], engine: 3 });
    expect(h).toMatchObject({ engine: 3 });
    expect(await verifyHello(h)).toBe(true);
    expect(parseHello(h)).toEqual(h);
    expect(await verifyHello({ ...h, engine: 4 })).toBe(false);
    expect(await verifyHello({ ...h, engine: undefined })).toBe(false);
    expect(parseHello({ ...h, engine: 1.5 })).toBeNull();
    expect(parseHello({ ...h, engine: '3' })).toBeNull();
    // An older peer sends no version: its Hello still parses and verifies, the session refuses it.
    const old = await signHello(keys, { game: 'g', seat: 2, roster: [] });
    expect(parseHello(old)).toEqual(old);
    expect(parseHello(old)!.engine).toBeUndefined();
    expect(await verifyHello(old)).toBe(true);
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

describe('Hello order and Coordinator, #359', () => {
  it('signs the join order of a Hello, parses it back, and refuses a changed order', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 1, roster: [keys.pub, ''], order: [keys.pub, 'kb', 'kc'] });
    expect(await verifyHello(h)).toBe(true);
    expect(await verifyHello({ ...h, order: ['kb', keys.pub, 'kc'] })).toBe(false);
    expect(parseHello(h)).toEqual(h);
    expect(parseHello({ ...h, order: [1] })).toBeNull();
    expect(parseHello({ ...h, order: 'x' })).toBeNull();
  });

  it('a Hello without an order keeps its old bytes', async () => {
    const keys = await generateKeys();
    const h = await signHello(keys, { game: 'g', seat: 2, roster: [] });
    expect('order' in h).toBe(false);
    expect(await verifyHello(h)).toBe(true);
    expect(parseHello(h)).toEqual(h);
  });

  it('signs an announcement or an acknowledgement of a coordinator, bound to the game and the coordinator', async () => {
    const keys = await generateKeys();
    const c = await signCoordinator(keys, { game: 'g', coordinator: 'kb' });
    expect(c).toMatchObject({ kind: 'coordinator', game: 'g', coordinator: 'kb', pub: keys.pub });
    expect(await verifyCoordinator(c)).toBe(true);
    expect(await verifyCoordinator({ ...c, coordinator: 'kc' })).toBe(false);
    expect(await verifyCoordinator({ ...c, game: 'h' })).toBe(false);
    expect(await verifyCoordinator({ ...c, sig: '!!' })).toBe(false);
  });

  it('parses a clean Coordinator and rejects every wrong shape', async () => {
    const keys = await generateKeys();
    const c = await signCoordinator(keys, { game: 'g', coordinator: 'kb' });
    expect(parseCoordinator({ ...c, extra: 1 })).toEqual(c);
    expect(parseCoordinator(null)).toBeNull();
    expect(parseCoordinator('x')).toBeNull();
    for (const bad of [{ kind: 'sync' }, { game: 1 }, { coordinator: 1 }, { pub: 1 }, { sig: 1 }]) {
      expect(parseCoordinator({ ...c, ...bad })).toBeNull();
    }
  });
});
