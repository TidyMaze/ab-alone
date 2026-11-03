// Audit-net (CTF 2026-11-03): safe behaviour of the royale receiver. Every test here fails today.
import { describe, expect, it } from 'vitest';
import { generateKeys, type Keys } from './moverecord';
import { RoyaleNet, type NetGame, type RoyaleMessage } from './royale-net';

// A stand-in for the wasm Royale: these receivers never reach the engine before the checks that fail.
const stub: NetGame = { board: () => [], cracks: () => [], resolve: () => {}, bot_order: () => [], state_hash: () => 'h', placement: () => [] };

const ROOM = 'room';
async function lone() {
  const a = await generateKeys();
  const b = await generateKeys();
  const sent: { m: RoyaleMessage; to?: string }[] = [];
  const net = new RoyaleNet({
    game: ROOM, keys: b, royale: stub, roundMs: 1000, now: () => 0, connected: () => true,
    send: (m, to) => sent.push({ m, to }), coordinator: () => a.pub, roster: () => [a.pub, b.pub, '', ''],
  });
  return { a, b, net, sent };
}
const start = (seats: string[]): RoyaleMessage => ({ kind: 'start', game: ROOM, round: 1, seats });

describe('audit-net: royale receivers', () => {
  it('A-R1: a coordinator start that lists one key on two arena seats is refused (a double army)', async () => {
    const { a, net } = await lone();
    await net.receive(start([a.pub, a.pub, '', '']), a.pub, 'A');
    expect(net.seats).toBeNull(); // today: seats = [A, A, '', ''], A gets two marble sets from one order
  });

  it('A-R2: a coordinator start that seats a key absent from the roster is refused', async () => {
    const { a, net } = await lone();
    const stranger: Keys = await generateKeys();
    await net.receive(start([a.pub, stranger.pub, '', '']), a.pub, 'A');
    expect(net.seats).toBeNull(); // today: accepted (and the real second player is evicted)
  });

  it('A-R3: a `behind` flood from one peer gets one answer, not one per message', async () => {
    const { a, net, sent } = await lone();
    await net.receive(start([a.pub, '', '', '']), a.pub, 'A');
    sent.length = 0;
    for (let i = 0; i < 50; i++) await net.receive({ kind: 'behind', game: ROOM, round: 1 }, '', 'X');
    expect(sent.filter((s) => s.m.kind === 'played' && s.to === 'X').length).toBeLessThanOrEqual(1); // today 50
  });

  it('A-R4: hashes for rounds far in the future are not kept without bound', async () => {
    const { a, net } = await lone();
    await net.receive(start([a.pub, '', '', '']), a.pub, 'A');
    for (let r = 100; r < 3100; r++) await net.receive({ kind: 'hash', game: ROOM, round: r, hash: 'h' }, a.pub, 'A');
    expect((net as unknown as { heard: unknown[] }).heard.length).toBeLessThan(100); // today 3000
  });

  it('keeps at most 200 near hashes, and answers at most 200 distinct peers in a round', async () => {
    const { a, net, sent } = await lone();
    await net.receive(start([a.pub, '', '', '']), a.pub, 'A');
    for (let i = 0; i < 300; i++) await net.receive({ kind: 'hash', game: ROOM, round: 2, hash: 'h' }, a.pub, 'A');
    expect((net as unknown as { heard: unknown[] }).heard.length).toBe(200);
    sent.length = 0;
    for (let i = 0; i < 201; i++) await net.receive({ kind: 'behind', game: ROOM, round: 1 }, '', `P${i}`);
    await net.receive({ kind: 'behind', game: ROOM, round: 1 }, '', 'P0');
    expect(sent.filter((s) => s.m.kind === 'played').length).toBe(200);
  });
});
