// Audit-net (CTF 2026-11-03): safe behaviour the session should have. Every test here fails today.
import { describe, expect, it, vi } from 'vitest';
import { OnlineSession, type Judge } from './session';
import { GENESIS, generateKeys, signHello, signMove, signReport, type Keys, type Report, type Wire } from './moverecord';
import type { ConnectionState, Transport } from './transport';

class Judge0 implements Judge {
  played: number[][] = [];
  to_move = () => 2; // White to move: the joiner's seat 2 in a 1v1 where the creator is Black
  play(mv: Int32Array) {
    this.played.push(Array.from(mv));
  }
  status = () => 0;
  restart() {}
}

function setup() {
  let record: (m: Wire, peer: string) => void = () => {};
  const state: ConnectionState = 'open';
  const transport: Transport = { state, send: () => {}, onRecord: (cb) => (record = cb), onState: () => {}, onLeave: () => {}, close: () => {} };
  return { transport, from: (peer: string, m: Wire) => record(m, peer) };
}

async function creator() {
  const r = setup();
  const keys = await generateKeys();
  const judge = new Judge0();
  const refused: string[] = [];
  const reports: Report[] = [];
  const session = new OnlineSession({ game: 'g', side: 1, seatCount: 2, engine: 1, keys, transport: r.transport, judge, onMove: () => {}, onRefuse: (x) => refused.push(x), onReport: (x) => reports.push(x) });
  const k2 = await generateKeys();
  r.from('p2', await signHello(k2, { game: 'g', seat: 2, roster: [], engine: 1 }));
  await session.settled;
  return { r, session, keys, k2, judge, refused, reports };
}

describe('audit-net: session receivers', () => {
  it('A-S1: a record from a key with no seat costs no signature check (seat is tested before the signature)', async () => {
    const { r, session } = await creator();
    const k3: Keys = await generateKeys(); // never said Hello, holds no seat
    const spy = vi.spyOn(crypto.subtle, 'verify');
    const before = spy.mock.calls.length;
    for (let i = 0; i < 5; i++) r.from('p3', await signMove(k3, { game: 'g', seq: 0, prev: GENESIS, move: [1, 0, 0, 2, 0, 0, 0, 0] }));
    await session.settled;
    expect(spy.mock.calls.length - before).toBe(0); // today 5: one Ed25519 verify per spam message
    spy.mockRestore();
  });

  it('A-S2: an absurdly long move is refused as malformed before any hashing or signature check', async () => {
    const { r, session, k2, refused, judge } = await creator();
    r.from('p2', await signMove(k2, { game: 'g', seq: 0, prev: GENESIS, move: Array.from({ length: 200_000 }, () => 1) }));
    await session.settled;
    expect(refused).toContain('malformed'); // today: reaches the judge (judge.played has 1 record of 200000 ints)
    expect(judge.played).toEqual([]);
  });

  it('A-S3: a match report of a game that is not over is refused (a report says a result, the game has none)', async () => {
    const { r, session, k2, reports } = await creator();
    // the creator plays Black (side 1), so the joiner is White (2); the engine status is still 0 (running)
    r.from('p2', await signReport(k2, { game: 'g', side: 2, hash: 'x', status: 2, rating: 1200 }));
    await session.settled;
    expect(reports).toEqual([]); // today: 1 report delivered, main.ts keeps it as rankedTheirs while the game runs
  });

  it('A-S4: a report rating outside the Elo range is refused', async () => {
    const { r, session, k2, reports } = await creator();
    for (const rating of [-1e300, 1e300, 99999]) r.from('p2', await signReport(k2, { game: 'g', side: 2, hash: 'x', status: 2, rating }));
    await session.settled;
    expect(reports.filter((x) => x.rating < 0 || x.rating > 4000)).toEqual([]); // today: 3
  });
});
