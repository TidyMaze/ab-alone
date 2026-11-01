import { describe, expect, it, vi } from 'vitest';
import { generateKeys, type Keys } from './moverecord';
import { parseLog } from './royale';
import { netStatus, parseRoyale, ROOM_JUDGE, roundPeriod, ROUND_MS, RoyaleNet, seedOf, type RoyaleMessage, type Sealed } from './royale-net';
import { commitOrder, signReveal } from './royale-round';

// Issue #504, docs/specs/tech.md section 6: the rounds of an online battle royale between peers on the real engine.
// No test waits for a time: `t` is the clock every peer reads, the test moves it and ticks.
vi.mock('abalone-wasm', async (importOriginal) => (await import('./test/wasm')).nodeWasm(importOriginal));
const { default: init, Royale } = await import('abalone-wasm');
await init();

const MS = 1000; // the round deadline of these tests
const ROOM = 'room';

interface Peer {
  name: string;
  keys: Keys;
  net: RoyaleNet<InstanceType<typeof Royale>>;
  game: InstanceType<typeof Royale>;
  rounds: Int32Array[]; // the orders of each round played out live
  changes: number;
}

/** A room of `count` seats: peers join it, seated or not, and every message goes to every other peer unless one of the
 * two is lost. The first peer to join coordinates. */
function table(count = 4) {
  let t = 0;
  const peers: Peer[] = [];
  const lost = new Set<string>();
  const sent: { from: string; to?: string; m: RoyaleMessage }[] = [];
  const roster: string[] = Array<string>(count).fill('');
  let coordinator = '';
  const deliver = (from: Peer, m: RoyaleMessage, to?: string): void => {
    sent.push({ from: from.name, to, m });
    for (const p of peers) {
      if (p === from || (to && to !== p.name) || lost.has(p.name) || lost.has(from.name)) continue;
      void p.net.receive(structuredClone(m), from.keys.pub, from.name);
    }
  };
  async function join(name: string, seat = -1, game = ROOM): Promise<Peer> {
    const keys = await generateKeys();
    if (seat >= 0) roster[seat] = keys.pub;
    coordinator ||= keys.pub;
    const royale = new Royale(count, seedOf(game));
    const peer: Peer = { name, keys, game: royale, rounds: [], changes: 0, net: null! };
    peer.net = new RoyaleNet({
      game,
      keys,
      royale,
      roundMs: MS,
      now: () => t,
      connected: () => !lost.has(name),
      send: (m, to) => deliver(peer, m, to),
      coordinator: () => coordinator,
      roster: () => [...roster],
      onRound: (_before, _cracks, orders) => peer.rounds.push(orders),
      onChange: () => peer.changes++,
    });
    peers.push(peer);
    return peer;
  }
  /** Waits until no peer has work queued: a peer hands messages to the others while it works. */
  async function settle(): Promise<void> {
    for (;;) {
      const queues = peers.map((p) => p.net.settled);
      await Promise.all(queues);
      if (peers.every((p, i) => p.net.settled === queues[i])) return;
    }
  }
  /** Moves the clock `ms` on and ticks every peer. */
  async function pass(ms: number): Promise<void> {
    t += ms;
    for (const p of peers) void p.net.tick();
    await settle();
  }
  return { join, settle, pass, lost, advance: (ms: number) => (t += ms), sent, roster, peers, deliver, coordinate: (k: string) => (coordinator = k) };
}

const firstOrder = (p: Peer, seat = p.net.you): number[] => Array.from(p.game.legal_orders(seat)).slice(0, 8);
const outcomes = (p: Peer): string[] => parseLog(p.game.round_log())!.turns.sort((a, b) => a.seat - b.seat).map((x) => x.outcome);
const kinds = (sent: { m: RoyaleMessage }[]): string[] => sent.map((s) => s.m.kind);

/** Three players in a room of four, a, b and c in seats 1 to 3, the fourth a bot; a coordinates and starts. */
async function started() {
  const room = table();
  const a = await room.join('a', 0);
  const b = await room.join('b', 1);
  const c = await room.join('c', 2);
  await a.net.start();
  await room.settle();
  return { room, a, b, c };
}

describe('roundPeriod / seedOf', () => {
  it('is 15 s, or the round URL parameter under webdriver, from 100 ms', () => {
    expect(ROUND_MS).toBe(15_000);
    expect(roundPeriod('', true)).toBe(ROUND_MS);
    expect(roundPeriod('?round=500', true)).toBe(500);
    expect(roundPeriod('?round=500', false)).toBe(ROUND_MS);
    expect(roundPeriod('?round=99', true)).toBe(ROUND_MS);
    expect(roundPeriod('?round=1.5', true)).toBe(ROUND_MS);
  });

  it('gives every peer of a room the same 32-bit seed, another room another', () => {
    expect(seedOf('abc')).toBe(seedOf('abc'));
    expect(seedOf('abc')).not.toBe(seedOf('abd'));
    expect(seedOf('')).toBe(0x811c9dc5);
    expect(Number.isInteger(seedOf('x'.repeat(40))) && seedOf('x'.repeat(40)) >= 0).toBe(true);
  });
});

describe('ROOM_JUDGE', () => {
  it('gives no seat the turn and refuses any move record: the rounds carry the orders', () => {
    expect(ROOM_JUDGE.to_move()).toBe(0);
    expect(ROOM_JUDGE.status()).toBe(0);
    expect(() => ROOM_JUDGE.play(Int32Array.from([1, 0, 0, 0, 0, 0, 0, 0]), true)).toThrow('no move record');
    expect(ROOM_JUDGE.restart()).toBeUndefined();
  });
});

describe('parseRoyale', () => {
  it('takes each message of the rounds and refuses a malformed one', async () => {
    const keys = await generateKeys();
    const { commit, reveal } = await commitOrder(keys, { game: 'g', round: 1, order: [] });
    const sealed: Sealed = { round: 1, commits: [commit], reveals: [reveal] };
    const good: unknown[] = [
      { kind: 'start', game: 'g', round: 1, seats: ['', 'k'] },
      { kind: 'behind', game: 'g', round: 2 },
      { kind: 'hash', game: 'g', round: 1, hash: 'ab' },
      { kind: 'played', game: 'g', seats: [], rounds: [sealed], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [], open: sealed },
      commit,
      reveal,
    ];
    for (const m of good) expect(parseRoyale(m)).toBe(m);
    const bad: unknown[] = [
      null,
      7,
      { kind: 'start', round: 1, seats: [] },
      { kind: 'start', game: 'g', round: 1.5, seats: [] },
      { kind: 'start', game: 'g', round: 1, seats: [1] },
      { kind: 'behind', game: 'g' },
      { kind: 'hash', game: 'g', round: 1 },
      { kind: 'played', game: 'g', seats: [], rounds: {}, open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [null], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [], open: 'x' },
      { kind: 'played', game: 'g', seats: [], rounds: [{ round: 1, commits: [reveal], reveals: [] }], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [{ round: 1, commits: [], reveals: [commit] }], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [{ round: 1, commits: {}, reveals: [] }], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [{ round: 1, commits: [], reveals: {} }], open: null },
      { kind: 'played', game: 'g', seats: [], rounds: [{ commits: [], reveals: [] }], open: null },
      { ...commit, hash: 1 },
      { ...commit, sig: 1 },
      { ...commit, pub: 1 },
      { ...reveal, order: [0.5] },
      { ...reveal, order: 'x' },
      { ...reveal, nonce: 1 },
      { kind: 'other', game: 'g' },
    ];
    for (const m of bad) expect(parseRoyale(m)).toBeNull();
  });
});

describe('RoyaleNet lobby', () => {
  it('names the seats from the roster, and only the coordinator starts the game, with the seats taken then', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 2);
    const watcher = await room.join('w');
    expect(a.net.phase).toBe('lobby');
    expect([a.net.you, b.net.you, watcher.net.you]).toEqual([0, 2, -1]);
    expect(b.net.names).toEqual(['Player 1', 'Bot 2', 'You', 'Bot 4']);
    expect(a.net.players).toBe(2);
    await b.net.start(); // not the coordinator
    await room.settle();
    expect(kinds(room.sent)).toEqual([]);
    await a.net.start();
    await room.settle();
    await a.net.start(); // started already
    expect(kinds(room.sent)).toEqual(['start']);
    expect(room.sent[0]!.m).toEqual({ kind: 'start', game: ROOM, round: 1, seats: [a.keys.pub, '', b.keys.pub, ''] });
    const late = await room.join('late', 1); // seated after the start: a spectator of this game, its seat a bot
    room.deliver(a, room.sent[0]!.m);
    await room.settle();
    expect([a.net.phase, b.net.phase, watcher.net.phase, late.net.phase]).toEqual(['choosing', 'choosing', 'waiting', 'waiting']);
    expect(late.net.names).toEqual(['Player 1', 'Bot 2', 'Player 3', 'Bot 4']);
    expect(late.net.players).toBe(2);
    expect(a.changes).toBeGreaterThan(0);
  });

  it('ignores a start from another key than the coordinator, with the wrong seat count, or for another room', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const other = await room.join('o', -1, 'other');
    room.deliver(b, { kind: 'start', game: ROOM, round: 1, seats: [a.keys.pub, b.keys.pub, '', ''] });
    room.deliver(a, { kind: 'start', game: ROOM, round: 1, seats: [a.keys.pub, b.keys.pub] });
    room.deliver(a, { kind: 'start', game: ROOM, round: 1, seats: [a.keys.pub, b.keys.pub, '', ''] }); // other's room is not ROOM
    await room.settle();
    expect(b.net.phase).toBe('choosing');
    expect([a.net.phase, other.net.phase]).toEqual(['lobby', 'lobby']);
  });
});

describe('RoyaleNet rounds', () => {
  it('a silent seat holds once the deadline passed; every peer resolves the same round and the coordinator starts the next', async () => {
    const { room, a, b, c } = await started();
    const move = firstOrder(a);
    await a.net.play(move);
    await b.net.play([]);
    await room.settle();
    expect([a.net.phase, b.net.phase, c.net.phase]).toEqual(['locked', 'locked', 'choosing']);
    await room.pass(MS - 1);
    expect(a.net.round).toBe(1); // c can still commit
    await room.pass(1);
    for (const p of [a, b, c]) {
      expect(p.net.round).toBe(2);
      expect(outcomes(p).slice(0, 3)).toEqual(['moved', 'held', 'held']); // the bot in seat 4 played its own order
      expect(p.game.state_hash()).toBe(a.game.state_hash());
      expect(p.net.desync).toBe(0);
      expect(p.rounds).toHaveLength(1);
    }
    expect(Array.from(a.rounds[0]!.slice(0, 9))).toEqual([0, ...move]);
    expect(a.rounds[0]![9]).toBe(3); // the bot's order, after a's: b and c hold
    expect([a.net.phase, b.net.phase, c.net.phase]).toEqual(['choosing', 'choosing', 'choosing']); // round 2 is open
    expect(kinds(room.sent).filter((k) => k === 'start')).toEqual(['start', 'start']);
  });

  it('reveals at once when every seat committed, and plays a round while the clock stands still', async () => {
    const { room, a, b, c } = await started();
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect([a.net.round, b.net.round, c.net.round]).toEqual([2, 2, 2]);
    expect(c.game.state_hash()).toBe(a.game.state_hash());
  });

  it('commits one order a round, none once the commit deadline passed, and none from a spectator', async () => {
    const { room, a, b, c } = await started();
    const watcher = await room.join('w');
    await a.net.play([]);
    await a.net.play(firstOrder(a)); // locked already
    await watcher.net.play([]);
    await room.settle();
    room.lost.add('a'); // a's reveal never comes
    await room.pass(MS);
    expect(b.net.phase).toBe('waiting'); // past the commit deadline, the round waits for a's reveal
    await b.net.play([]);
    await room.pass(MS); // the reveal deadline: a holds
    expect(c.net.round).toBe(2);
    expect(outcomes(c).slice(0, 3)).toEqual(['held', 'held', 'held']);
    const signers = room.sent.flatMap((s) => (s.m.kind === 'commit' ? [s.m.pub] : []));
    expect(new Set(signers)).toEqual(new Set([a.keys.pub])); // b forwards a's commit, signs none of its own, nor w
  });

  it('a commit that misses the deadline while it is signed is dropped: the seat holds', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    await a.net.start();
    await room.settle();
    await b.net.play(firstOrder(b)); // b commits so the round waits for its reveal
    await room.settle();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      room.advance(MS); // the deadline passes while a hashes its order
      return digest(...args);
    });
    await a.net.play(firstOrder(a));
    await room.pass(0);
    expect(a.net.round).toBe(2);
    expect(outcomes(a).slice(0, 2)).toEqual(['held', 'moved']);
  });

  it('keeps a commit that comes before the start of its round, and a message of a later round, until it opens', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    room.lost.add('b');
    await a.net.start(); // b misses the start
    await a.net.play([]);
    await room.settle();
    room.lost.delete('b');
    const early = await commitOrder(a.keys, { game: ROOM, round: 2, order: [] });
    room.deliver(a, early.commit); // a later round: kept
    room.deliver(a, room.sent.find((s) => s.m.kind === 'commit')!.m); // round 1 before its start: kept
    room.deliver(a, room.sent[0]!.m); // the start
    await room.settle();
    expect(b.net.phase).toBe('choosing');
    await b.net.play([]);
    await room.settle();
    expect([a.net.round, b.net.round]).toEqual([2, 2]);
    expect(b.game.state_hash()).toBe(a.game.state_hash());
  });

  it('a start of the next round while ours is still open waits for it, and no peer says it is behind', async () => {
    const { room, a, b, c } = await started();
    room.deliver(a, { kind: 'start', game: ROOM, round: 2, seats: a.net.seats! }); // as if a were a few messages ahead
    await room.settle();
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect([a.net.round, b.net.round, c.net.round]).toEqual([2, 2, 2]);
    expect([b.net.phase, c.net.phase]).toEqual(['choosing', 'choosing']);
    expect(kinds(room.sent)).not.toContain('behind');
  });

  it('ignores a commit or reveal of a round played, one the book refuses, and the start of a round open or played', async () => {
    const { room, a, b, c } = await started();
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    const sent = room.sent.length;
    const old = room.sent.find((s) => s.m.kind === 'commit')!.m;
    const start1 = room.sent.find((s) => s.m.kind === 'start')!.m;
    const start2 = room.sent.filter((s) => s.m.kind === 'start')[1]!.m;
    room.deliver(a, old);
    room.deliver(a, start1);
    room.deliver(a, start2);
    const forged = await commitOrder(await generateKeys(), { game: ROOM, round: 2, order: [] });
    room.deliver(a, forged.commit);
    await room.settle();
    expect(room.sent.length).toBe(sent + 4); // nothing forwarded, nobody behind
    expect(b.net.phase).toBe('choosing');
  });

  it('turns a malformed order into a hold, so the round still resolves', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    await a.net.start();
    await room.settle();
    for (const order of [[1, 9, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0, 0, 0], [1, -1, 0, 0, 0, 0, 0, 0]]) {
      await a.net.play(order);
      await b.net.play([]);
      await room.settle();
      expect(outcomes(b)[0]).toBe('held');
    }
    expect(b.game.state_hash()).toBe(a.game.state_hash());
  });

  it('reports a desync when a peer hash differs, whether it comes before or after our own', async () => {
    const { room, a, b, c } = await started();
    room.deliver(c, { kind: 'hash', game: ROOM, round: 1, hash: 'early' }); // before a resolved round 1
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect(a.net.desync).toBe(1);
    room.deliver(c, { kind: 'hash', game: ROOM, round: 1, hash: 'late' });
    await room.settle();
    expect(b.net.desync).toBe(1);
    room.deliver(c, { kind: 'hash', game: ROOM, round: 1, hash: b.game.state_hash() }); // the same: nothing new
    await room.settle();
    expect(c.net.desync).toBe(0);
  });

  it('stops once the game is over: no next round, nothing to commit', async () => {
    const room = table(3);
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const c = await room.join('c', 2);
    await a.net.start();
    await room.settle();
    while (a.net.phase !== 'over') {
      for (const p of [a, b, c]) await p.net.play([]);
      await room.settle();
    }
    expect([b.net.phase, c.net.phase]).toEqual(['over', 'over']);
    const starts = kinds(room.sent).filter((k) => k === 'start').length;
    expect(starts).toBe(a.net.round - 1);
    await a.net.play([]);
    await room.pass(3 * MS);
    expect(kinds(room.sent).filter((k) => k === 'start').length).toBe(starts);
  });
});

describe('RoyaleNet deadline (#673)', () => {
  it('gives the ms left to commit while the open round takes commits, to a spectator too, and none otherwise', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const watcher = await room.join('w');
    expect(a.net.left).toBeNull(); // the lobby
    await a.net.start();
    await room.settle();
    expect([a.net.left, b.net.left, watcher.net.left]).toEqual([MS, MS, MS]);
    await room.pass(300);
    expect(a.net.left).toBe(MS - 300);
    await a.net.play([]);
    await room.settle();
    expect(a.net.left).toBe(MS - 300); // locked: the others still have that long
    room.lost.add('a'); // a's reveal never comes
    await room.pass(MS - 300);
    expect([b.net.left, watcher.net.left]).toEqual([null, null]); // the reveal
  });
});

describe('RoyaleNet dropped seat (#674)', () => {
  /** The order the seat played in the round `orders` of a peer played out, [] for a hold. */
  const playedBy = (orders: Int32Array, seat: number): number[] => {
    for (let i = 0; i < orders.length; i += 9) if (orders[i] === seat) return Array.from(orders.slice(i + 1, i + 9));
    return [];
  };

  it('a seat that missed 2 commits is played by the bot from the next round on, on every peer, until it commits again', async () => {
    const { room, a, b, c } = await started();
    room.lost.add('c'); // c is gone
    const bots: number[][] = [];
    for (let i = 0; i < 3; i++) {
      bots.push(Array.from(a.game.bot_order(2))); // what the bot would order for c's seat from this round's start
      for (const p of [a, b]) await p.net.play([]);
      await room.pass(MS);
    }
    expect(a.net.round).toBe(4);
    expect(playedBy(a.rounds[0]!, 2)).toEqual([]); // rounds 1 and 2: c's seat holds
    expect(playedBy(a.rounds[1]!, 2)).toEqual([]);
    expect(playedBy(a.rounds[2]!, 2)).toEqual(bots[2]); // round 3: the first after 2 missed commits, the bot plays it
    expect(playedBy(b.rounds[2]!, 2)).toEqual(bots[2]);
    expect(b.game.state_hash()).toBe(a.game.state_hash());
    // Round 4: c is still gone, the bot plays on. Then c is back: it replays the rounds it missed, the same way.
    for (const p of [a, b]) await p.net.play([]);
    await room.pass(MS);
    expect(playedBy(a.rounds[3]!, 2)).toHaveLength(8);
    room.lost.delete('c');
    await c.net.resync();
    await room.settle();
    expect(c.net.round).toBe(5);
    expect(c.game.state_hash()).toBe(a.game.state_hash());
    // Round 5: c commits again and retakes its seat; a silent round after that holds, as for any seat.
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect(playedBy(a.rounds[4]!, 2)).toEqual([]);
    expect(outcomes(a)[2]).toBe('held');
    for (const p of [a, b]) await p.net.play([]);
    await room.pass(MS);
    expect(playedBy(a.rounds[5]!, 2)).toEqual([]);
    for (const p of [a, b, c]) expect(p.game.state_hash()).toBe(a.game.state_hash());
    expect([a.net.desync, b.net.desync, c.net.desync]).toEqual([0, 0, 0]);
  });
});

describe('RoyaleNet catch-up', () => {
  it('a peer back after missing 2 rounds says it is behind at the next start, replays them and plays on', async () => {
    const { room, a, b, c } = await started();
    room.lost.add('c');
    for (let i = 0; i < 2; i++) {
      await a.net.play(firstOrder(a));
      await b.net.play([]);
      await room.pass(MS); // c is silent: it holds
    }
    expect(a.net.round).toBe(3);
    room.lost.delete('c');
    // Round 3 opened while c was lost: c hears of it at the next start.
    await a.net.play([]);
    await b.net.play([]);
    await room.pass(MS);
    expect(kinds(room.sent.filter((s) => s.from === 'c'))).toContain('behind');
    expect(c.net.round).toBe(4);
    expect(c.game.state_hash()).toBe(a.game.state_hash());
    expect(c.rounds).toHaveLength(0); // what it replays is not played out
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect([a.net.round, b.net.round, c.net.round]).toEqual([5, 5, 5]);
    expect(c.game.state_hash()).toBe(a.game.state_hash());
    expect([a.net.desync, b.net.desync, c.net.desync]).toEqual([0, 0, 0]);
  });

  it('a peer that missed the start of the open round gets it, and the commits made so far, with the answer', async () => {
    const { room, a, b, c } = await started();
    await a.net.play([]);
    await b.net.play([]);
    room.lost.add('c');
    await room.pass(MS); // round 1 resolves without c's reveal... c holds, round 2 starts unheard by c
    room.lost.delete('c');
    await a.net.play(firstOrder(a)); // round 2: a commits, c misses it too
    await room.settle();
    room.deliver(a, room.sent.filter((s) => s.m.kind === 'start')[1]!.m); // the start of round 2 again, now c hears it
    await room.settle();
    expect(kinds(room.sent.filter((s) => s.from === 'c'))).toContain('behind'); // its round 1 went stale: it is behind
    expect(c.net.round).toBe(2);
    expect(c.net.phase).toBe('choosing');
    await b.net.play([]);
    await c.net.play([]);
    await room.settle();
    expect([a.net.round, b.net.round, c.net.round]).toEqual([3, 3, 3]);
    expect(c.game.state_hash()).toBe(a.game.state_hash());
  });

  it('a peer that asks while the open round reveals gets the reveals made so far too', async () => {
    const { room, a, b, c } = await started();
    room.lost.add('c');
    for (const p of [a, b]) await p.net.play([]);
    await room.pass(MS); // round 1 resolves for a and b, it goes stale on c
    for (const p of [a, b]) await p.net.play(firstOrder(p));
    await room.settle();
    room.lost.add('b'); // b's reveal of round 2 is lost
    await room.pass(MS); // a reveals and waits for b's reveal
    room.lost.delete('c');
    room.deliver(c, { kind: 'behind', game: ROOM, round: 1 }, 'a');
    await room.settle();
    expect(room.sent.at(-1)?.m).toMatchObject({ kind: 'reveal', pub: a.keys.pub }); // c forwards a's reveal
    expect([c.net.round, c.net.phase]).toEqual([2, 'choosing']);
    await room.pass(2 * MS); // a's reveal deadline, and c's
    expect([a.net.round, c.net.round]).toEqual([3, 3]);
    expect(outcomes(c).slice(0, 3)).toEqual(['moved', 'held', 'held']); // b's reveal never came: it holds
    expect(c.game.state_hash()).toBe(a.game.state_hash());
  });

  it('a peer back after a short drop asks at once, and gets the commits it missed into its open round', async () => {
    const { room, a, b, c } = await started();
    room.lost.add('c');
    await a.net.play(firstOrder(a)); // c misses it
    await room.settle();
    room.lost.delete('c');
    await c.net.resync();
    await room.settle();
    expect(kinds(room.sent.filter((s) => s.from === 'c'))).toContain('behind');
    for (const p of [b, c]) await p.net.play([]);
    await room.settle();
    expect([a.net.round, c.net.round]).toEqual([2, 2]);
    expect(outcomes(c)[0]).toBe('moved');
    expect(c.game.state_hash()).toBe(a.game.state_hash());
  });

  it('says nothing when it asks again from the lobby: there is no round to miss yet', async () => {
    const room = table();
    const a = await room.join('a', 0);
    await a.net.resync();
    expect(room.sent).toEqual([]);
  });

  it('a spectator joining late gets the seats and every round so far', async () => {
    const { room, a, b, c } = await started();
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    const watcher = await room.join('w');
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    expect(watcher.net.round).toBe(3);
    expect(watcher.net.you).toBe(-1);
    expect(watcher.game.state_hash()).toBe(a.game.state_hash());
  });

  it('answers nothing when it has nothing the peer lacks, and ignores an answer that does not fit', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    room.deliver(b, { kind: 'behind', game: ROOM, round: 1 }); // a is in the lobby
    await room.settle();
    expect(kinds(room.sent)).toEqual(['behind']);
    await a.net.start();
    await a.net.play([]);
    await b.net.play([]);
    await room.settle();
    const sent = room.sent.length;
    room.deliver(b, { kind: 'behind', game: ROOM, round: 9 }, 'a'); // a has not played round 9, its open round is 2
    await room.settle();
    const answer = room.sent[sent + 1]!.m;
    expect(answer).toMatchObject({ kind: 'played', rounds: [], open: { round: 2 } });
    room.deliver(a, { kind: 'played', game: ROOM, seats: [a.keys.pub], rounds: [], open: null }); // wrong seat count
    room.deliver(a, answer); // nothing b lacks: its round 2 is open
    room.deliver(a, { ...(answer as object), open: null } as RoyaleMessage);
    await room.settle();
    expect(b.net.round).toBe(2);
    expect(b.net.phase).toBe('choosing');
  });

  it('replays nothing past the end of the game', async () => {
    const room = table(3);
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const c = await room.join('c', 2);
    await a.net.start();
    await room.settle();
    room.lost.add('c');
    while (a.net.phase !== 'over') {
      await a.net.play([]);
      await b.net.play([]);
      await room.pass(MS);
    }
    room.lost.delete('c');
    const rounds = (room.sent.find((s) => s.m.kind === 'played') ?? { m: null }).m;
    expect(rounds).toBeNull();
    room.deliver(c, { kind: 'behind', game: ROOM, round: 1 }, 'a');
    await room.settle();
    const played = room.sent.find((s) => s.m.kind === 'played')!.m;
    room.deliver(a, { ...(played as object), rounds: [...(played as { rounds: Sealed[] }).rounds, { round: a.net.round, commits: [], reveals: [] }] } as RoyaleMessage);
    await room.settle();
    expect(c.net.phase).toBe('over');
    expect(c.game.state_hash()).toBe(a.game.state_hash());
  });

  it('a reveal replayed for a seat that never committed counts for nothing', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const watcher = await room.join('w');
    await a.net.start();
    await room.settle();
    const stray = await signReveal(b.keys, { game: ROOM, round: 1, order: firstOrder(b), nonce: '00' });
    room.deliver(a, { kind: 'played', game: ROOM, seats: [a.keys.pub, b.keys.pub, '', ''], rounds: [{ round: 1, commits: [], reveals: [stray] }], open: null }, 'w');
    await room.settle();
    expect(watcher.net.round).toBe(2);
    expect(outcomes(watcher).slice(0, 2)).toEqual(['held', 'held']);
  });
});

describe('RoyaleNet trust (#1322)', () => {
  it('a played from a key with no seat sets no seats in the lobby: the coordinator start still does', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    const forged = await generateKeys();
    const seats = [forged.pub, '', '', ''];
    await b.net.receive({ kind: 'played', game: ROOM, seats, rounds: [], open: null }, '', 'x');
    await b.net.receive({ kind: 'played', game: ROOM, seats, rounds: [], open: null }, forged.pub, 'x');
    await b.net.receive({ kind: 'played', game: ROOM, seats: [a.keys.pub + ',' + b.keys.pub + ',', ''], rounds: [], open: null }, '', 'x'); // the roster joined
    await b.net.receive({ kind: 'hash', game: ROOM, round: 1, hash: 'x' }, a.keys.pub, 'a'); // no seats yet: no hash counts
    expect(b.net.phase).toBe('lobby');
    expect(b.net.seats).toBeNull();
    await a.net.start();
    await room.settle();
    expect(b.net.seats).toEqual([a.keys.pub, b.keys.pub, '', '']);
    expect(b.net.phase).toBe('choosing');
    for (const p of [a, b]) await p.net.play([]);
    await room.settle();
    expect([b.net.round, b.net.desync]).toEqual([2, 0]); // the hash heard in the lobby was not kept
  });

  it('a played with the roster in the lobby, or with the seats of the start, is believed', async () => {
    const room = table();
    const a = await room.join('a', 0);
    const b = await room.join('b', 1);
    await b.net.receive({ kind: 'played', game: ROOM, seats: [...room.roster], rounds: [], open: null }, '', 'x');
    expect(b.net.seats).toEqual([a.keys.pub, b.keys.pub, '', '']);
  });

  it('a played with other seats than the start replays nothing', async () => {
    const { room, a, b, c } = await started();
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    const watcher = await room.join('w');
    room.lost.add('w'); // its behind goes nowhere: only the forged answer reaches it
    await watcher.net.receive({ kind: 'start', game: ROOM, round: 2, seats: [a.keys.pub, b.keys.pub, c.keys.pub, ''] }, a.keys.pub, 'a');
    await watcher.net.receive({ kind: 'played', game: ROOM, seats: [a.keys.pub, '', '', ''], rounds: [{ round: 1, commits: [], reveals: [] }], open: null }, '', 'x');
    expect(watcher.net.round).toBe(1);
    expect(watcher.net.seats).toEqual([a.keys.pub, b.keys.pub, c.keys.pub, '']);
  });

  it('a hash counts only from a seated key: one with no key or no seat raises no desync', async () => {
    const { room, a, b, c } = await started();
    const watcher = await room.join('w');
    for (const p of [a, b, c]) await p.net.play([]);
    await room.settle();
    await a.net.receive({ kind: 'hash', game: ROOM, round: 1, hash: 'x' }, '', 'x');
    await a.net.receive({ kind: 'hash', game: ROOM, round: 1, hash: 'x' }, watcher.keys.pub, 'w');
    expect(a.net.desync).toBe(0);
    await a.net.receive({ kind: 'hash', game: ROOM, round: 1, hash: 'x' }, c.keys.pub, 'c');
    expect(a.net.desync).toBe(1);
  });
});

describe('netStatus', () => {
  it('says what the player can do now, a desync first', () => {
    expect(netStatus('lobby', true, 1, 0)).toEqual({ text: '1 player in. Start: bots take the empty seats', tone: 'waiting' });
    expect(netStatus('lobby', false, 3, 0)).toEqual({ text: '3 players in. Waiting for the start...', tone: 'waiting' });
    expect(netStatus('choosing', false, 3, 0)).toEqual({ text: 'Your order: a move or Hold', tone: 'here' });
    expect(netStatus('locked', false, 3, 0)).toEqual({ text: 'Order locked, waiting for the others...', tone: 'here' });
    expect(netStatus('waiting', false, 3, 0)).toEqual({ text: 'Waiting for the round...', tone: 'watching' });
    expect(netStatus('over', false, 3, 0)).toEqual({ text: '3 players, game over', tone: 'watching' });
    expect(netStatus('choosing', false, 3, 4)).toEqual({ text: "Desync after round 4: a peer's game differs", tone: 'gone' });
  });
});
