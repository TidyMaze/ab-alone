import { describe, expect, it } from 'vitest';
import { MoveLog } from './movelog';
import { GENESIS, generateKeys, hashRecord, signMove } from './moverecord';

const M1 = [1, 0, 0, 2, 0, 0, 0, 0];
const M2 = [2, 0, 0, 3, 0, 0, 0, 0];
const M3 = [1, 0, 1, 2, 0, 0, 0, 0];

async function pair() {
  const alice = await generateKeys();
  const bob = await generateKeys();
  return { alice, bob, a: new MoveLog('g', alice.pub), b: new MoveLog('g', bob.pub) };
}

describe('MoveLog', () => {
  it('chains the records it signs: seq counts up, prev is the hash of the previous record', async () => {
    const { alice, a } = await pair();
    const r0 = await a.sign(alice, M1);
    const r1 = await a.sign(alice, M2);
    expect([r0.seq, r1.seq]).toEqual([0, 1]);
    expect(r0.prev).toBe(GENESIS);
    expect(r1.prev).toBe(await hashRecord(r0));
    expect(a.length).toBe(2);
    expect(a.head).toBe(await hashRecord(r1));
  });

  it('gives the records from a seq on, for a peer that has only the ones before it, #226', async () => {
    const { alice, a } = await pair();
    const r0 = await a.sign(alice, M1);
    const r1 = await a.sign(alice, M2);
    const r2 = await a.sign(alice, M3);
    expect(a.from(0)).toEqual([r0, r1, r2]);
    expect(a.from(1)).toEqual([r1, r2]);
    expect(a.from(3)).toEqual([]);
    expect(a.from(5)).toEqual([]);
  });

  it('accepts a good record from the other side and appends it', async () => {
    const { alice, a, b } = await pair();
    const r0 = await a.sign(alice, M1);
    expect(await b.verify(r0)).toEqual({ ok: true });
    await b.append(r0);
    expect(b.length).toBe(1);
    expect(b.head).toBe(a.head);
  });

  it('refuses a tampered move', async () => {
    const { alice, a, b } = await pair();
    const r0 = await a.sign(alice, M1);
    expect(await b.verify({ ...r0, move: M2 })).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuses a replayed record', async () => {
    const { alice, a, b } = await pair();
    const r0 = await a.sign(alice, M1);
    await b.append(r0);
    expect(await b.verify(r0)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('refuses a record that skips ahead (wrong order)', async () => {
    const { alice, a, b } = await pair();
    await a.sign(alice, M1);
    const r1 = await a.sign(alice, M2);
    expect(await b.verify(r1)).toEqual({ ok: false, reason: 'out-of-order' });
  });

  it('refuses a record whose prev does not match the chain head', async () => {
    const { alice, a, b } = await pair();
    const forged = await signMove(alice, { game: 'g', seq: 0, prev: 'ab'.repeat(32), move: M1 });
    expect(await b.verify(forged)).toEqual({ ok: false, reason: 'bad-chain' });
    void a;
  });

  it('refuses a record for another game', async () => {
    const { alice, b } = await pair();
    const rec = await signMove(alice, { game: 'other', seq: 0, prev: GENESIS, move: M1 });
    expect(await b.verify(rec)).toEqual({ ok: false, reason: 'wrong-game' });
  });

  it('does not pin a remote key: the seat table of the session decides who may move', async () => {
    const { alice, a, b } = await pair();
    const carol = await generateKeys();
    const r0 = await a.sign(alice, M1);
    await b.append(r0);
    const next = await signMove(carol, { game: 'g', seq: 1, prev: b.head, move: M2 });
    expect(await b.verify(next)).toEqual({ ok: true });
  });

  it('lists its records oldest first, as a copy: the signed log of the game for the diagnostics', async () => {
    const { alice, bob, a } = await pair();
    expect(a.list()).toEqual([]);
    const r0 = await a.sign(alice, M1);
    const r1 = await signMove(bob, { game: 'g', seq: 1, prev: a.head, move: M2 });
    await a.append(r1);
    const list = a.list();
    list.pop();
    expect(a.list()).toEqual([r0, r1]);
  });

  it('refuses an echo of its own record', async () => {
    const { alice, a } = await pair();
    const r0 = await a.sign(alice, M1);
    const next = await signMove(alice, { game: 'g', seq: 1, prev: a.head, move: M2 });
    expect(await a.verify(next)).toEqual({ ok: false, reason: 'wrong-key' });
    void r0;
  });
});
