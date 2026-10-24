import { describe, expect, it, vi } from 'vitest';
import { OnlineSession, type Judge } from './session';
import {
  GENESIS,
  generateKeys,
  hashRecord,
  signHello,
  signMove,
  signRematch,
  type Keys,
  type Missed,
  type MoveRecord,
  type Rematch,
  type Sync,
  type Wire,
} from './moverecord';
import { nextGameId } from './rematch';
import { localPair, type ConnectionState, type Transport } from './transport';

const M1 = [1, 0, 0, 2, 0, 0, 0, 0];
const M2 = [2, 0, 0, 3, 0, 0, 0, 0];
const M3 = [1, 0, 1, 2, 0, 0, 0, 0];
const WIN = [7, 0, 0, 0, 0, 0, 0, 0]; // the FakeJudge ends the game: the mover wins

// Stands in for the wasm engine: alternates Black then White, refuses any move starting with 9 and
// any move once the game is over.
class FakeJudge implements Judge {
  played: number[][] = [];
  winner = 0;
  to_move(): number {
    return (this.played.length % 2) + 1;
  }
  play(mv: Int32Array): void {
    if (mv[0] === 9 || this.winner !== 0) throw new Error('IllegalMove');
    if (mv[0] === 7) this.winner = this.to_move();
    this.played.push(Array.from(mv));
  }
  status(): number {
    return this.winner;
  }
  restart(): void {
    this.played = [];
    this.winner = 0;
  }
}

// Every session the tests make, for settle. Those of earlier tests are idle: waiting on them is free.
const live: OnlineSession[] = [];
class WatchedSession extends OnlineSession {
  constructor(...args: ConstructorParameters<typeof OnlineSession>) {
    super(...args);
    live.push(this);
  }
}

// Waits for the work, not for a time, however slow WebCrypto is (bug #190). A session hands messages
// to another while it works: go round until a whole pass finds no queue that grew.
async function settle(): Promise<void> {
  for (;;) {
    const queues = live.map((s) => s.settled);
    await Promise.all(queues);
    if (live.every((s, i) => s.settled === queues[i])) return;
  }
}

async function player(transport: Transport, side: number, seatCount = 2) {
  const judge = new FakeJudge();
  const moves: number[][] = [];
  const refused: string[] = [];
  const states: string[] = [];
  const roles: string[] = [];
  const seen: string[] = []; // presence of the other seat, at each change
  const asks: number[] = []; // calls of onRematchAsk
  const rematches: number[] = []; // our side at each new game
  const keys = await generateKeys();
  const session: OnlineSession = new WatchedSession({
    game: 'g',
    side,
    seatCount,
    keys,
    transport,
    judge,
    onMove: (m) => moves.push(m),
    onRefuse: (r) => refused.push(r),
    onState: (s) => states.push(s),
    onRole: (r) => roles.push(r),
    onPresence: () => seen.push(session.presenceOf(3 - side)),
    onRematchAsk: () => asks.push(asks.length + 1),
    onRematch: () => rematches.push(session.side),
  });
  return { judge, moves, refused, states, roles, seen, asks, rematches, keys, session };
}
type Player = Awaited<ReturnType<typeof player>>;

// `p` plays `move` on its own engine and sends it, then everyone handles what follows.
async function play(p: Player, move: number[]): Promise<void> {
  p.judge.play(Int32Array.from(move));
  await p.session.send(move);
  await settle();
}

// Black creates the room, White joins: both Hello messages cross before anyone plays.
async function seated() {
  const [ta, tb] = localPair();
  const black = await player(ta, 1);
  const white = await player(tb, 2);
  await settle();
  return { black, white };
}

// The test plays the room: it names the peer each message comes from and says which peer left.
function room() {
  let record: (m: Wire, peer: string) => void = () => {};
  let leave: (peer: string) => void = () => {};
  let state: ConnectionState = 'open';
  const sent: Wire[] = [];
  const to: (string | undefined)[] = []; // the one peer each sent message was for, undefined for every peer
  const transport: Transport = {
    get state() {
      return state;
    },
    send: (m, peer) => {
      sent.push(m);
      to.push(peer);
    },
    onRecord: (cb) => {
      record = cb;
    },
    onState: () => {},
    onLeave: (cb) => {
      leave = cb;
    },
    close: () => {},
  };
  return {
    transport,
    sent,
    to,
    from: (peer: string, m: Wire) => record(m, peer),
    leave: (peer: string) => leave(peer),
    drop: () => {
      state = 'closed';
    },
  };
}

// A raw peer on the other end of a pair, for hand made messages.
const hello = (keys: Keys, seat: number, roster: string[] = []) => signHello(keys, { game: 'g', seat, roster });
const sync = (seq: number, game = 'g', asked: string[] = []): Sync => ({ kind: 'sync', game, seq, asked });
const missed = (of: MoveRecord | Rematch): Missed => ({ kind: 'missed', of });
const kindOf = (m: Wire) => (m as { kind?: string }).kind;
// What a session in a room sent from the `at`th message on in answer to a Sync: each signed message it
// missed, and the one peer it went to.
const answers = (r: ReturnType<typeof room>, at = 0) =>
  r.sent.flatMap((m, i) => (i >= at && kindOf(m) === 'missed' ? [{ of: (m as Missed).of, to: r.to[i] }] : []));
const syncsIn = (sent: Wire[]) => sent.filter((m) => kindOf(m) === 'sync');

describe('OnlineSession', () => {
  it('lets two tabs of one browser play: each game start makes its own key, bug #116', async () => {
    const { black, white } = await seated();
    black.judge.play(Int32Array.from(M1));
    await black.session.send(M1);
    await settle();
    expect(white.refused).toEqual([]);
    expect(white.moves).toEqual([M1]);
  });

  it('sends a signed move that the other side verifies, replays and reports', async () => {
    const { black, white } = await seated();
    black.judge.play(Int32Array.from(M1)); // the sender applied it locally first
    await black.session.send(M1);
    await settle();
    expect(white.judge.played).toEqual([M1]);
    expect(white.moves).toEqual([M1]);
    expect(white.refused).toEqual([]);
  });

  it('hands out the signed log of the game, the same on both sides', async () => {
    const { black, white } = await seated();
    black.judge.play(Int32Array.from(M1));
    await black.session.send(M1);
    await settle();
    white.judge.play(Int32Array.from(M2));
    await white.session.send(M2);
    await settle();
    const log = black.session.signedLog;
    expect(log.map((r) => [r.seq, r.move, r.pub])).toEqual([
      [0, M1, black.keys.pub],
      [1, M2, white.keys.pub],
    ]);
    expect(white.session.signedLog).toEqual(log);
  });

  it('plays a two move exchange in order', async () => {
    const { black, white } = await seated();
    black.judge.play(Int32Array.from(M1));
    await black.session.send(M1);
    await settle();
    white.judge.play(Int32Array.from(M2));
    await white.session.send(M2);
    await settle();
    expect(black.moves).toEqual([M2]);
    expect(black.judge.played).toEqual([M1, M2]);
    expect(black.refused).toEqual([]);
  });

  it('plays the exchange even when each signature check is slow, as on a loaded machine, bug #190', async () => {
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    const slow = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 50)); // the tests must wait for the checks, not for a time
      return verify(...args);
    });
    try {
      const { black, white } = await seated();
      black.judge.play(Int32Array.from(M1));
      await black.session.send(M1);
      await settle();
      white.judge.play(Int32Array.from(M2));
      await white.session.send(M2);
      await settle();
      expect(black.moves).toEqual([M2]);
      expect(black.judge.played).toEqual([M1, M2]);
      expect(slow).toHaveBeenCalled();
    } finally {
      slow.mockRestore();
    }
  });

  it('refuses a move the engine calls illegal and does not apply it', async () => {
    const [x, y] = localPair();
    const white = await player(y, 2);
    const peer = await generateKeys();
    x.send(await hello(peer, 1, [peer.pub, '']));
    await settle();
    x.send(await signMove(peer, { game: 'g', seq: 0, prev: GENESIS, move: [9, 0, 0, 0, 0, 0, 0, 0] }));
    await settle();
    expect(white.judge.played).toEqual([]);
    expect(white.refused).toEqual(['illegal']);
  });

  it('refuses a forged signature and a replay, and still takes the good move', async () => {
    const [x, y] = localPair();
    const white = await player(y, 2);
    const peer = await generateKeys();
    x.send(await hello(peer, 1, [peer.pub, '']));
    await settle();
    const r0 = await signMove(peer, { game: 'g', seq: 0, prev: GENESIS, move: M1 });
    x.send({ ...r0, move: M2 });
    await settle();
    x.send(r0);
    await settle();
    x.send(r0);
    await settle();
    expect(white.refused).toEqual(['bad-signature', 'replayed']);
    expect(white.judge.played).toEqual([M1]);
  });

  it('refuses a move that arrives when it is not the sender side to move', async () => {
    const [x, y] = localPair();
    const black = await player(y, 1); // Black to move: a remote record (White) is out of turn
    const peer = await generateKeys();
    x.send(await hello(peer, 2));
    await settle();
    x.send(await signMove(peer, { game: 'g', seq: 0, prev: GENESIS, move: M1 }));
    await settle();
    expect(black.refused).toEqual(['not-their-turn']);
    expect(black.judge.played).toEqual([]);
  });

  it('refuses something that is not a record', async () => {
    const [x, y] = localPair();
    const white = await player(y, 2);
    x.send({ nope: 1 } as unknown as MoveRecord);
    await settle();
    expect(white.refused).toEqual(['malformed']);
  });

  it('reports the connection state of its transport', async () => {
    const [x, y] = localPair();
    const white = await player(y, 2);
    x.close();
    expect(white.states).toEqual(['closed']);
  });

  it('can play only once the transport is open, the opponent is here and it is our turn', async () => {
    let state: ConnectionState = 'connecting';
    let notify: (s: ConnectionState) => void = () => {};
    let record: (m: Wire, peer: string) => void = () => {};
    const transport: Transport = {
      get state() {
        return state;
      },
      send: () => {},
      onRecord: (cb) => {
        record = cb;
      },
      onState: (cb) => {
        notify = cb;
      },
      onLeave: () => {},
      close: () => {},
    };
    const black = await player(transport, 1);
    expect(black.session.canPlay()).toBe(false); // waiting for the opponent: a move would never arrive
    state = 'open';
    notify('open');
    await settle();
    expect(black.session.canPlay()).toBe(false); // open, but White never said Hello
    record(await hello(await generateKeys(), 2), 'b');
    await settle();
    expect(black.session.canPlay()).toBe(true);
    black.judge.play(Int32Array.from(M1));
    expect(black.session.canPlay()).toBe(false); // White to move
  });

  it('binds each seat to one key: a third key and a second White Hello are refused, the bound White plays, bug #117', async () => {
    const [x, y] = localPair();
    const black = await player(y, 1);
    const sent: unknown[] = [];
    x.onRecord((m) => sent.push(m));
    const white = await generateKeys();
    const third = await generateKeys();
    x.send(await hello(white, 2));
    await settle();
    x.send(await hello(third, 2)); // the seat is taken: refused, the creator tells everyone who holds it
    await settle();
    expect(black.refused).toEqual(['seat-refused']);
    expect(sent.at(-1)).toMatchObject({ kind: 'hello', seat: 1, roster: [black.keys.pub, white.pub] });

    black.judge.play(Int32Array.from(M1));
    await black.session.send(M1);
    await settle();
    const r0 = sent.find((m) => (m as MoveRecord).sig && (m as MoveRecord).seq === 0) as MoveRecord;
    const prev = await hashRecord(r0);
    x.send(await signMove(third, { game: 'g', seq: 1, prev, move: M2 }));
    await settle();
    expect(black.refused).toEqual(['seat-refused', 'wrong-key']);
    expect(black.judge.played).toEqual([M1]);

    x.send(await signMove(white, { game: 'g', seq: 1, prev, move: M2 }));
    await settle();
    expect(black.refused).toEqual(['seat-refused', 'wrong-key']);
    expect(black.moves).toEqual([M2]);
    expect(black.judge.played).toEqual([M1, M2]);
  });

  it('seats the joiner when the creator lists its key, and keeps a spectator out when the room is full', async () => {
    const [x, y] = localPair();
    const joiner = await player(y, 2);
    const creator = await generateKeys();
    const rival = await generateKeys();
    x.send(await hello(creator, 1, [creator.pub, '']));
    await settle();
    expect(joiner.roles).toEqual([]); // not seated yet, not refused either
    expect(joiner.session.canPlay()).toBe(false);
    x.send(await hello(creator, 1, [creator.pub, rival.pub]));
    await settle();
    expect(joiner.roles).toEqual(['spectator']);
    expect(joiner.session.canPlay()).toBe(false);
    // A spectator still follows the game: moves of both seats reach its engine.
    const r0 = await signMove(creator, { game: 'g', seq: 0, prev: GENESIS, move: M1 });
    x.send(r0);
    x.send(await signMove(rival, { game: 'g', seq: 1, prev: await hashRecord(r0), move: M2 }));
    await settle();
    expect(joiner.moves).toEqual([M1, M2]);
    await joiner.session.send(M3); // a spectator cannot send
    expect(joiner.refused).toEqual([]);
  });

  it('seats a joiner whose key the creator lists', async () => {
    const { black, white } = await seated();
    expect(white.roles).toEqual(['player']);
    expect(black.roles).toEqual([]);
    expect(white.session.canPlay()).toBe(false); // Black to move
  });

  it('takes the seat count as a parameter: three seats, the fourth peer is refused', async () => {
    const [x, y] = localPair();
    const host = await player(y, 1, 3);
    const keys = [await generateKeys(), await generateKeys(), await generateKeys()];
    for (const [i, k] of keys.entries()) {
      x.send(await hello(k, i + 2));
      await settle();
    }
    expect(host.refused).toEqual(['seat-refused']); // seats 2 and 3 bound, seat 4 does not exist
  });

  it('refuses a Hello that is forged, for another game or not a Hello', async () => {
    const [x, y] = localPair();
    const black = await player(y, 1);
    const peer = await generateKeys();
    const good = await hello(peer, 2);
    x.send({ ...good, seat: 1 });
    x.send({ ...good, game: 'other' });
    x.send({ kind: 'hello', game: 'g' } as unknown as MoveRecord);
    await settle();
    expect(black.refused).toEqual(['bad-hello', 'bad-hello', 'bad-hello']);
    expect(black.session.seats.roster()).toEqual([black.keys.pub, '']);
  });

  it('keeps the same key on its seat when it says Hello again', async () => {
    const [x, y] = localPair();
    const black = await player(y, 1);
    const peer = await generateKeys();
    x.send(await hello(peer, 2));
    x.send(await hello(peer, 2));
    await settle();
    expect(black.refused).toEqual([]);
    expect(black.session.seats.keyOf(2)).toBe(peer.pub);
  });

  it('as a joiner ignores Hellos that are not from the creator, a rival creator and a bad roster', async () => {
    const [x, y] = localPair();
    const joiner = await player(y, 2);
    const creator = await generateKeys();
    const other = await generateKeys();
    x.send(await hello(other, 3)); // another joiner: the creator decides, not us
    x.send(await hello(creator, 1, ['someone else', ''])); // the sender must be first in its own roster
    x.send(await hello(creator, 1, [creator.pub])); // wrong size
    await settle();
    expect(joiner.session.seats.roster()).toEqual(['', '']);
    x.send(await hello(creator, 1, [creator.pub, '']));
    x.send(await hello(other, 1, [other.pub, joiner.keys.pub])); // a later seat 1 Hello does not replace the creator
    await settle();
    expect(joiner.session.seats.roster()).toEqual([creator.pub, '']);
    expect(joiner.session.role).toBe('pending');
    x.send(await hello(creator, 1, [creator.pub, joiner.keys.pub]));
    await settle();
    expect(joiner.session.role).toBe('player');
    expect(joiner.refused).toEqual([]);
  });

  it('shows the White seat waiting, here once its key said Hello, gone when its peer leaves, here again on reconnect', async () => {
    const r = room();
    const black = await player(r.transport, 1);
    const white = await generateKeys();
    expect(black.session.presenceOf(2)).toBe('waiting');
    r.from('b', await hello(white, 2));
    await settle();
    expect(black.session.presenceOf(2)).toBe('here');
    r.leave('b');
    await settle();
    expect(black.session.presenceOf(2)).toBe('gone');
    r.from('b', await hello(white, 2)); // the same player back, same key
    await settle();
    expect(black.session.presenceOf(2)).toBe('here');
    expect(black.seen).toEqual(['here', 'gone', 'here']);
    expect(black.refused).toEqual([]);
  });

  it('as a joiner sees Black here once seated, and disconnected when the creator peer leaves', async () => {
    const r = room();
    const joiner = await player(r.transport, 2);
    const creator = await generateKeys();
    expect(joiner.session.presenceOf(1)).toBe('waiting');
    r.from('a', await hello(creator, 1, [creator.pub, joiner.keys.pub]));
    await settle();
    expect(joiner.session.role).toBe('player');
    expect(joiner.session.presenceOf(1)).toBe('here');
    r.leave('a');
    await settle();
    expect(joiner.session.presenceOf(1)).toBe('gone');
    expect(joiner.seen).toEqual(['here', 'gone']);
  });

  it('ties presence to the bound key: a spectator leaving, an unknown peer and a forged Hello change nothing, bug #117', async () => {
    const r = room();
    const black = await player(r.transport, 1);
    const white = await generateKeys();
    const third = await generateKeys();
    const whiteHello = await hello(white, 2);
    r.from('b', whiteHello);
    r.from('c', await hello(third, 2)); // refused: the seat is White's
    r.leave('c');
    r.leave('nobody');
    await settle();
    expect(black.session.presenceOf(2)).toBe('here');
    expect(black.seen).not.toContain('gone');
    r.leave('b');
    r.from('c', { ...whiteHello, seat: 1 }); // White's key with a broken signature
    await settle();
    expect(black.session.presenceOf(2)).toBe('gone');
    expect(black.refused).toEqual(['seat-refused', 'bad-hello']);
  });

  it('handles a leave after the Hello that came before it, even while that Hello is still being verified', async () => {
    const r = room();
    const black = await player(r.transport, 1);
    const white = await generateKeys();
    r.from('b', await hello(white, 2));
    r.leave('b'); // at once: the signature check above is still running
    await settle();
    expect(black.session.presenceOf(2)).toBe('gone');
  });

  it('can play only while the opponent seat is present: a spectator still connected is not enough, #143', async () => {
    const r = room();
    const black = await player(r.transport, 1);
    const white = await generateKeys();
    r.from('b', await hello(white, 2));
    r.from('c', await hello(await generateKeys(), 2)); // a spectator: the seat is White's
    await settle();
    expect(black.session.canPlay()).toBe(true);
    r.leave('b');
    await settle();
    expect(black.session.canPlay()).toBe(false); // the spectator is still connected, White is not
    r.from('b', await hello(white, 2)); // White back on its key
    await settle();
    expect(black.session.canPlay()).toBe(true);
  });

  it('works without the optional callbacks', async () => {
    const [x, y] = localPair();
    const judge = new FakeJudge();
    const keys = await generateKeys();
    const session = new WatchedSession({ game: 'g', side: 2, keys, transport: y, judge, onMove: () => {}, onRefuse: () => {} });
    const creator = await generateKeys();
    x.send(await hello(creator, 1, [creator.pub, 'x']));
    x.close();
    await settle();
    expect(session.role).toBe('spectator');
  });
});

// No fixed sleeps here: WebCrypto can be slow on a loaded machine (#190). Each test waits for a
// condition, or for a malformed sentinel to be refused: messages are handled in arrival order, so
// once the sentinel is refused, everything sent before it was handled.
const until = (check: () => void) => vi.waitFor(check, { timeout: 15_000, interval: 5 });
const SENTINEL = { nope: 1 } as unknown as Wire;

// Black creates the room, White joins, and each sees the other's key here.
async function ready() {
  const [ta, tb] = localPair();
  const black = await player(ta, 1);
  const white = await player(tb, 2);
  await until(() => {
    expect(white.session.role).toBe('player');
    expect(black.session.presenceOf(2)).toBe('here');
    expect(white.session.presenceOf(1)).toBe('here');
  });
  return { black, white };
}

// A creator session in a room the test plays by hand, with White's key seated and here.
async function hostWithWhite() {
  const r = room();
  const black = await player(r.transport, 1);
  const white = await generateKeys();
  r.from('b', await hello(white, 2));
  await until(() => expect(black.session.presenceOf(2)).toBe('here'));
  return { r, black, white };
}

// Black's local move ends the game, as a sixth ejection or a draw would.
async function blackWins(black: Player) {
  black.judge.play(Int32Array.from(WIN));
  await black.session.send(WIN);
}

describe('OnlineSession rematch, #186', { timeout: 30_000 }, () => {
  it('starts the rematch once both seated players asked: new game id, fresh log, the former White plays Black and moves first', async () => {
    const { black, white } = await ready();
    await blackWins(black);
    await until(() => expect(white.judge.status()).toBe(1));
    expect(black.session.canRematch()).toBe(true);
    expect(white.session.canRematch()).toBe(true);

    await black.session.rematch();
    expect(black.session.askedRematch(1)).toBe(true);
    expect(black.session.askedRematch(2)).toBe(false);
    expect(black.session.canRematch()).toBe(false); // asked once
    await until(() => expect(white.session.askedRematch(1)).toBe(true));
    expect(white.session.askedRematch(2)).toBe(false);
    expect(white.asks.length).toBeGreaterThan(0);
    expect(black.rematches).toEqual([]);
    expect(white.rematches).toEqual([]);

    await white.session.rematch();
    expect(white.rematches).toEqual([1]);
    await until(() => expect(black.rematches).toEqual([2]));
    const next = await nextGameId('g');
    for (const p of [black, white]) {
      expect(p.session.game).toBe(next);
      expect(p.judge.played).toEqual([]);
      expect(p.judge.status()).toBe(0);
      expect(p.session.askedRematch(1)).toBe(false);
      expect(p.session.askedRematch(2)).toBe(false);
      expect(p.session.role).toBe('player');
    }
    expect(black.session.side).toBe(2);
    expect(white.session.side).toBe(1);
    expect(black.session.presenceOf(1)).toBe('here');
    expect(white.session.presenceOf(2)).toBe('here');
    expect(black.session.canPlay()).toBe(false);
    expect(white.session.canPlay()).toBe(true);

    // The new Black (the former White) opens the new game, the new White answers.
    white.judge.play(Int32Array.from(M1));
    await white.session.send(M1);
    await until(() => expect(black.moves).toEqual([M1]));
    black.judge.play(Int32Array.from(M2));
    await black.session.send(M2);
    await until(() => expect(white.moves).toEqual([WIN, M2])); // WIN ended the first game
    expect(black.refused).toEqual([]);
    expect(white.refused).toEqual([]);
  });

  it('refuses a move signed for the old game id and an ask replayed from the old game, and takes the new game moves', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    r.from('b', await signRematch(white, { game: 'g' }));
    await black.session.rematch();
    expect(black.rematches).toEqual([2]);
    expect(r.sent.at(-1)).toMatchObject({ kind: 'rematch', game: 'g', pub: black.keys.pub });
    const next = black.session.game;

    r.from('b', await signMove(white, { game: 'g', seq: 0, prev: GENESIS, move: M1 }));
    r.from('b', await signRematch(white, { game: 'g' }));
    await until(() => expect(black.refused).toEqual(['wrong-game', 'stale-rematch']));
    expect(black.judge.played).toEqual([]);
    expect(black.session.askedRematch(1)).toBe(false);

    r.from('b', await signMove(white, { game: next, seq: 0, prev: GENESIS, move: M1 }));
    await until(() => expect(black.moves).toEqual([M1]));
    expect(black.refused).toEqual(['wrong-game', 'stale-rematch']);
  });

  it('refuses a forged ask, an ask for another game, one from a key without a seat, and a malformed one', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    const good = await signRematch(white, { game: 'g' });
    r.from('b', { ...good, sig: (await signRematch(white, { game: 'other' })).sig });
    r.from('b', await signRematch(white, { game: 'other' }));
    r.from('c', await signRematch(await generateKeys(), { game: 'g' }));
    r.from('b', { kind: 'rematch', game: 1 } as unknown as Wire);
    await until(() => expect(black.refused).toEqual(['bad-rematch', 'stale-rematch', 'wrong-key', 'bad-rematch']));
    expect(black.session.askedRematch(2)).toBe(false);
    await black.session.rematch(); // only our own ask: no new game
    expect(black.rematches).toEqual([]);
    expect(black.session.game).toBe('g');
  });

  it('cannot ask while the game runs, nor once the opponent is gone', async () => {
    const { r, black } = await hostWithWhite();
    expect(black.session.canRematch()).toBe(false); // the game runs
    await black.session.rematch();
    expect(r.sent.some((m) => (m as { kind?: string }).kind === 'rematch')).toBe(false);

    await blackWins(black);
    expect(black.session.canRematch()).toBe(true);
    r.leave('b');
    await until(() => expect(black.session.presenceOf(2)).toBe('gone'));
    expect(black.session.canRematch()).toBe(false); // the ask would reach nobody, as a move would not (#143)
    await black.session.rematch();
    expect(r.sent.some((m) => (m as { kind?: string }).kind === 'rematch')).toBe(false);
  });

  it('cannot ask on a closed transport, nor ask twice', async () => {
    const { r, black } = await hostWithWhite();
    await blackWins(black);
    r.drop();
    expect(black.session.canRematch()).toBe(false);
    await black.session.rematch();
    expect(r.sent.some((m) => (m as { kind?: string }).kind === 'rematch')).toBe(false);
    const second = await hostWithWhite();
    await blackWins(second.black);
    await second.black.session.rematch();
    await second.black.session.rematch();
    expect(second.r.sent.filter((m) => (m as { kind?: string }).kind === 'rematch')).toHaveLength(1);
  });

  it('keeps a spectator a spectator: no Rematch for it, it follows the new game, even with the asks before the last move', async () => {
    const r = room();
    const watcher = await player(r.transport, 2);
    const creator = await generateKeys();
    const rival = await generateKeys();
    r.from('a', await hello(creator, 1, [creator.pub, rival.pub]));
    r.from('c', await hello(rival, 2));
    await until(() => expect(watcher.session.role).toBe('spectator'));

    // The asks can overtake the last move on another channel: they wait for the game to be over here.
    r.from('a', await signRematch(creator, { game: 'g' }));
    r.from('c', await signRematch(rival, { game: 'g' }));
    r.from('a', SENTINEL);
    await until(() => expect(watcher.refused).toEqual(['malformed']));
    expect(watcher.rematches).toEqual([]);
    expect(watcher.session.askedRematch(1)).toBe(true);
    expect(watcher.session.askedRematch(2)).toBe(true);

    r.from('a', await signMove(creator, { game: 'g', seq: 0, prev: GENESIS, move: WIN }));
    await until(() => expect(watcher.rematches.length).toBe(1));
    expect(watcher.session.role).toBe('spectator');
    expect(watcher.session.canRematch()).toBe(false);
    await watcher.session.rematch();
    expect(r.sent.some((m) => (m as { kind?: string }).kind === 'rematch')).toBe(false);
    const next = await nextGameId('g');
    expect(watcher.session.game).toBe(next);

    // The former White moves first in the new game, the former Black may not.
    r.from('a', await signMove(creator, { game: next, seq: 0, prev: GENESIS, move: M1 }));
    const r0 = await signMove(rival, { game: next, seq: 0, prev: GENESIS, move: M1 });
    r.from('c', r0);
    r.from('a', await signMove(creator, { game: next, seq: 1, prev: await hashRecord(r0), move: M2 }));
    await until(() => expect(watcher.moves).toEqual([WIN, M1, M2]));
    expect(watcher.refused).toEqual(['malformed', 'not-their-turn']);
  });

  it('rematches without the optional callbacks', async () => {
    const r = room();
    const judge = new FakeJudge();
    const keys = await generateKeys();
    const session = new OnlineSession({ game: 'g', side: 1, keys, transport: r.transport, judge, onMove: () => {}, onRefuse: () => {} });
    const white = await generateKeys();
    r.from('b', await hello(white, 2));
    await until(() => expect(session.presenceOf(2)).toBe('here'));
    judge.play(Int32Array.from(WIN));
    r.from('b', await signRematch(white, { game: 'g' }));
    await until(() => expect(session.askedRematch(2)).toBe(true));
    await session.rematch();
    expect(session.side).toBe(2);
    expect(judge.played).toEqual([]);
  });
});

// Two ends whose link the test controls (#198). `lose` loses what an end sends from now on, as a
// message in flight when the connection drops. `reconnect` drops the link and opens it again, as
// Trystero does: each end hears its peer leave, then the transport opens and each session says Hello
// and Sync (#226).
function flakyPair() {
  type Handlers = { record: (m: Wire, peer: string) => void; state: (s: ConnectionState) => void; leave: (peer: string) => void };
  const names = ['a', 'b'];
  const on: Handlers[] = names.map(() => ({ record: () => {}, state: () => {}, leave: () => {} }));
  const lost = new Set<number>();
  let state: ConnectionState = 'open';
  const end = (i: number): Transport => ({
    get state() {
      return state;
    },
    send: (m) => {
      if (state === 'open' && !lost.has(i)) on[1 - i]!.record(m, names[i]!);
    },
    onRecord: (cb) => {
      on[i]!.record = cb;
    },
    onState: (cb) => {
      on[i]!.state = cb;
    },
    onLeave: (cb) => {
      on[i]!.leave = cb;
    },
    close: () => {},
  });
  return {
    ends: [end(0), end(1)] as const,
    lose: (i: number) => lost.add(i),
    reconnect: () => {
      state = 'closed';
      on.forEach((h, i) => {
        h.state('closed');
        h.leave(names[1 - i]!);
      });
      lost.clear();
      state = 'open';
      on.forEach((h) => h.state('open'));
    },
  };
}

const sentAsks = (sent: Wire[]) => sent.filter((m) => (m as { kind?: string }).kind === 'rematch');

describe('OnlineSession rematch ask lost in a connection drop, #198', () => {
  // Black creates the room, White joins over a link the test can break, Black's last move ends the game.
  async function finished() {
    const link = flakyPair();
    const black = await player(link.ends[0], 1);
    const white = await player(link.ends[1], 2);
    await settle();
    black.judge.play(Int32Array.from(WIN));
    await black.session.send(WIN);
    await settle();
    expect(white.judge.status()).toBe(1);
    return { link, black, white };
  }

  // Both peers in the same new game with the colours swapped, and it plays: the former White opens it.
  async function sameNewGame(black: Player, white: Player) {
    const next = await nextGameId('g');
    expect(black.session.game).toBe(next);
    expect(white.session.game).toBe(next);
    expect(black.session.side).toBe(2);
    expect(white.session.side).toBe(1);
    expect(black.judge.played).toEqual([]);
    expect(white.judge.played).toEqual([]);
    white.judge.play(Int32Array.from(M1));
    await white.session.send(M1);
    await settle();
    expect(black.moves).toEqual([M1]);
    expect(black.judge.played).toEqual([M1]);
  }

  it('sends our ask again when the opponent says Hello again: the ask lost in the drop reaches it', async () => {
    const { link, black, white } = await finished();
    link.lose(0);
    await black.session.rematch(); // lost on the way
    await settle();
    expect(white.session.askedRematch(1)).toBe(false);

    link.reconnect();
    await settle();
    expect(white.session.askedRematch(1)).toBe(true);
    await white.session.rematch();
    await settle();
    await sameNewGame(black, white);
    expect(black.refused).toEqual([]);
    expect(white.refused).toEqual([]);
  });

  it('our ask lost, then the opponent asks: we start the new game alone, and hand it our ask on reconnect', async () => {
    const { link, black, white } = await finished();
    link.lose(0);
    await black.session.rematch(); // lost
    await white.session.rematch(); // reaches Black: Black starts the new game, White waits in the finished one
    await settle();
    expect(black.rematches).toEqual([2]);
    expect(white.rematches).toEqual([]);

    link.reconnect();
    await settle();
    expect(white.rematches).toEqual([1]);
    await sameNewGame(black, white);
    expect(white.refused).toEqual([]);
    expect(black.refused).toEqual([]); // White's Sync brought it Black's ask, White sent nothing stale (#226)
  });

  it('the opponent ask lost after ours arrived: the opponent started the new game and hands us its ask on reconnect', async () => {
    const { link, black, white } = await finished();
    await black.session.rematch(); // reaches White
    link.lose(1);
    await white.session.rematch(); // lost: White starts the new game, Black waits in the finished one
    await settle();
    expect(white.rematches).toEqual([1]);
    expect(black.rematches).toEqual([]);
    expect(black.session.game).toBe('g'); // the stuck room of the issue: White is now Black and moves first

    link.reconnect();
    await settle();
    expect(black.rematches).toEqual([2]);
    await sameNewGame(black, white);
    expect(black.refused).toEqual([]);
    expect(white.refused).toEqual([]); // Black's Sync brought it White's ask, Black sent nothing stale (#226)
  });

  it('sends no ask on a Hello alone: the Sync after it gets our ask, to whoever lacks it, a spectator too', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    await black.session.rematch();
    const [ours] = sentAsks(r.sent);
    const at = r.sent.length;
    r.leave('b');
    r.from('b', await hello(white, 2)); // White back after a drop
    r.from('c', await hello(await generateKeys(), 2)); // a spectator: the seat is White's
    await settle();
    expect(answers(r, at)).toEqual([]);
    r.from('b', sync(1)); // White lacks our ask
    r.from('c', sync(1)); // so does the spectator, which needs it to follow the rematch
    r.from('b', sync(1, 'g', [black.keys.pub])); // has it: nothing
    await settle();
    expect(answers(r, at)).toEqual([
      { of: ours, to: 'b' },
      { of: ours, to: 'c' },
    ]);
    expect(sentAsks(r.sent)).toEqual([ours]);
  });

  it('answers nothing to a stale ask: the Sync of a peer stuck in the finished game gets our ask of it, once per Sync', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    r.from('b', await signRematch(white, { game: 'g' }));
    await black.session.rematch(); // both asked: Black starts the new game
    await settle();
    const next = await nextGameId('g');
    expect(black.session.game).toBe(next);
    const [ours] = sentAsks(r.sent);
    const at = r.sent.length;

    const old = await signRematch(white, { game: 'g' }); // White still in the finished game, asking again
    r.from('b', old);
    r.from('b', { ...old, sig: (await signRematch(white, { game: next })).sig }); // forged
    r.from('c', await signRematch(await generateKeys(), { game: 'g' })); // a key without a seat
    await settle();
    expect(r.sent.length).toBe(at);
    expect(black.refused).toEqual(['stale-rematch', 'bad-rematch', 'stale-rematch']);

    r.from('b', sync(1, 'g', [white.pub])); // White's Sync from the finished game: it lacks our ask
    r.from('b', sync(1, 'g', [white.pub])); // a second Sync, a second answer, never more
    await settle();
    expect(answers(r, at)).toEqual([
      { of: ours, to: 'b' },
      { of: ours, to: 'b' },
    ]);
    expect(black.session.game).toBe(next);
    expect(black.session.askedRematch(1)).toBe(false);
    expect(black.session.askedRematch(2)).toBe(false);
    expect(black.judge.played).toEqual([]);
  });
});

// The ends of one room, a full mesh as in Trystero (#226): a message goes to every other end, or only to
// the end `to` names. `drop` loses what goes to and from an end from now on, as a connection that broke
// before anyone noticed, and `mend` delivers again. `back` reconnects it: every end hears it leave and it
// hears them leave, then every transport opens again, so each session says Hello and Sync.
function mesh() {
  type Handlers = { record: (m: Wire, peer: string) => void; state: (s: ConnectionState) => void; leave: (peer: string) => void };
  const on = new Map<string, Handlers>();
  const dropped = new Set<string>();
  const sent: { from: string; to: string | undefined; m: Wire }[] = [];
  return {
    sent,
    end(name: string): Transport {
      const h: Handlers = { record: () => {}, state: () => {}, leave: () => {} };
      on.set(name, h);
      return {
        state: 'open',
        send: (m, to) => {
          sent.push({ from: name, to, m });
          for (const [peer, p] of on) {
            if (peer !== name && (to === undefined || to === peer) && !dropped.has(name) && !dropped.has(peer)) p.record(m, name);
          }
        },
        onRecord: (cb) => {
          h.record = cb;
        },
        onState: (cb) => {
          h.state = cb;
        },
        onLeave: (cb) => {
          h.leave = cb;
        },
        close: () => {},
      };
    },
    drop: (name: string) => dropped.add(name),
    mend: (name: string) => dropped.delete(name),
    back(name: string) {
      for (const [peer, p] of on) {
        if (peer === name) continue;
        p.leave(name);
        on.get(name)!.leave(peer);
      }
      dropped.delete(name);
      for (const p of on.values()) p.state('open');
    },
  };
}

const missedIn = (sent: ReturnType<typeof mesh>['sent']) => sent.filter((s) => kindOf(s.m) === 'missed');

describe('OnlineSession catch-up of what a peer missed, #226', () => {
  // Black creates the room, White joins over a mesh, and they play `moves` in turn, Black first.
  async function playing(...moves: number[][]) {
    const m = mesh();
    const black = await player(m.end('a'), 1);
    const white = await player(m.end('b'), 2);
    await settle();
    for (const [i, mv] of moves.entries()) await play(i % 2 === 0 ? black : white, mv);
    return { m, black, white };
  }

  // Both seated players ask for a rematch: the next game starts on both.
  async function rematchBoth(black: Player, white: Player) {
    await black.session.rematch();
    await white.session.rematch();
    await settle();
  }

  it('a player back after a drop gets the move lost on the way from the peer that has it, and plays on', async () => {
    const { m, black, white } = await playing(M1, M2);
    m.drop('b'); // White's connection breaks before anyone notices: Black still plays, its move is lost
    await play(black, M3);
    expect(white.judge.played).toEqual([M1, M2]);
    m.back('b');
    await settle();
    expect(white.judge.played).toEqual([M1, M2, M3]);
    expect(white.moves).toEqual([M1, M3]);
    expect(missedIn(m.sent)).toEqual([
      { from: 'a', to: 'b', m: { kind: 'missed', of: expect.objectContaining({ seq: 2, move: M3, pub: black.keys.pub }) } },
    ]);
    expect(white.session.canPlay()).toBe(true);

    // The other way round: Black's connection breaks, White's move is lost, Black gets it back.
    m.drop('a');
    await play(white, M2);
    m.back('a');
    await settle();
    expect(black.judge.played).toEqual([M1, M2, M3, M2]);
    expect(missedIn(m.sent).map((s) => [s.from, s.to])).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    await play(black, M1);
    expect(white.judge.played).toEqual([M1, M2, M3, M2, M1]);
    expect(black.refused).toEqual([]);
    expect(white.refused).toEqual([]);
  });

  it('a spectator joining after 4 plies gets them from the players once it has the roster, and follows the game', async () => {
    const { m, black, white } = await playing(M1, M2, M3, M2);
    const watcher = await player(m.end('c'), 2);
    await settle();
    expect(watcher.session.role).toBe('spectator');
    expect(watcher.judge.played).toEqual([M1, M2, M3, M2]);
    expect(watcher.moves).toEqual([M1, M2, M3, M2]);
    // Both players answered, to the spectator alone: the second answer brought nothing new, and is no refusal.
    expect(watcher.refused).toEqual([]);
    expect(missedIn(m.sent).map((s) => `${s.from}>${s.to}`).sort()).toEqual([...Array(4).fill('a>c'), ...Array(4).fill('b>c')]);

    await play(black, M1);
    expect(watcher.moves).toEqual([M1, M2, M3, M2, M1]);
    expect(watcher.refused).toEqual([]);
    expect(white.refused).toEqual([]);
    expect(black.refused).toEqual(['seat-refused']); // the spectator asked for White's seat
  });

  it('a spectator back after a drop gets every move it missed', async () => {
    const { m, black, white } = await playing();
    const watcher = await player(m.end('c'), 2);
    await settle(); // seated as a spectator: a move before the roster would be refused for want of a seat
    await play(black, M1);
    m.drop('c');
    await play(white, M2);
    await play(black, M3);
    await play(white, M2);
    expect(watcher.judge.played).toEqual([M1]);
    m.back('c');
    await settle();
    expect(watcher.judge.played).toEqual([M1, M2, M3, M2]);
    expect(watcher.refused).toEqual([]);
  });

  it('a peer two games behind after two rematches replays both games and their asks, and ends in the same game at the same ply', async () => {
    const { m, black, white } = await playing(WIN); // Black wins the first game
    await rematchBoth(black, white);
    await play(white, WIN); // the former White plays Black in the second game, opens it and wins it
    await rematchBoth(black, white);
    await play(black, M1); // Black plays Black again in the third game
    const third = await nextGameId(await nextGameId('g'));
    expect(black.session.game).toBe(third);

    const watcher = await player(m.end('c'), 2);
    await settle();
    expect(watcher.session.game).toBe(third);
    expect(watcher.rematches).toHaveLength(2);
    expect(watcher.moves).toEqual([WIN, WIN, M1]);
    expect(watcher.judge.played).toEqual([M1]);
    expect(watcher.refused).toEqual([]);
    await play(white, M2);
    expect(watcher.judge.played).toEqual([M1, M2]);
    expect(watcher.refused).toEqual([]);
  });

  it('checks every record and ask of an answer as a live one: nothing it cannot verify is applied, and it never asks again', async () => {
    const r = room();
    const watcher = await player(r.transport, 2);
    const creator = await generateKeys();
    const rival = await generateKeys();
    await settle();
    expect(syncsIn(r.sent)).toEqual([]); // no roster yet: the answer could not be checked against the seats
    r.from('a', await hello(creator, 1, [creator.pub, rival.pub]));
    await settle();
    expect(watcher.session.role).toBe('spectator');
    expect(syncsIn(r.sent)).toEqual([sync(0)]);

    const r0 = await signMove(creator, { game: 'g', seq: 0, prev: GENESIS, move: M1 });
    const prev = await hashRecord(r0);
    const r1 = await signMove(rival, { game: 'g', seq: 1, prev, move: M2 });
    r.from('a', missed({ ...r0, move: M3 })); // forged
    r.from('a', missed(r1)); // out of order: r0 is not there yet
    r.from('a', missed(r0));
    r.from('a', missed(r0)); // already there, as from a second answer: skipped, no refusal
    r.from('a', missed(await signMove(await generateKeys(), { game: 'g', seq: 1, prev, move: M2 }))); // a key without a seat
    r.from('a', missed(await signMove(creator, { game: 'g', seq: 1, prev, move: M2 }))); // not Black's turn
    r.from('a', missed(await signMove(rival, { game: 'later', seq: 0, prev: GENESIS, move: M2 }))); // a game it never had
    r.from('a', missed(await signRematch(await generateKeys(), { game: 'g' }))); // an ask from a key without a seat
    r.from('a', missed({ ...(await signRematch(rival, { game: 'g' })), game: 'later' })); // a forged ask
    r.from('a', missed(r1));
    r.from('a', { kind: 'missed', of: await hello(creator, 1, []) } as unknown as Wire); // not a record nor an ask
    await settle();
    expect(watcher.refused).toEqual(['bad-signature', 'out-of-order', 'wrong-key', 'not-their-turn', 'wrong-game', 'wrong-key', 'bad-rematch', 'malformed']);
    expect(watcher.judge.played).toEqual([M1, M2]);
    expect(watcher.moves).toEqual([M1, M2]);
    expect(watcher.session.askedRematch(1)).toBe(false);
    expect(syncsIn(r.sent)).toHaveLength(1); // a bad answer never makes it ask again, so it cannot loop
  });

  it('answers a Sync with the records from its seq, to that peer alone, once per Sync, and nothing to a peer not behind', async () => {
    const { r, black } = await hostWithWhite();
    await blackWins(black);
    const win = r.sent.at(-1) as MoveRecord;
    let at = r.sent.length;
    r.from('c', sync(0)); // a spectator that has nothing
    await settle();
    expect(answers(r, at)).toEqual([{ of: win, to: 'c' }]);

    at = r.sent.length;
    for (const s of [sync(1), sync(3), sync(0, 'later')]) r.from('b', s); // same ply, ahead, a game we never had
    r.from('c', { kind: 'sync', game: 'g' } as unknown as Wire);
    await settle();
    expect(r.sent.length).toBe(at);
    expect(black.refused).toEqual(['malformed']);

    r.from('c', sync(0));
    r.from('c', sync(0));
    await settle();
    expect(answers(r, at)).toEqual([
      { of: win, to: 'c' },
      { of: win, to: 'c' },
    ]);
  });

  it('answers with the asks the peer lacks of its game, then every record and ask of each game after it', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    const win = r.sent.at(-1) as MoveRecord;
    const theirs = await signRematch(white, { game: 'g' });
    r.from('b', theirs);
    await settle();
    let at = r.sent.length;
    r.from('c', sync(1)); // at the last ply, without White's ask
    r.from('b', sync(1, 'g', [white.pub])); // White has its own ask: nothing
    await settle();
    expect(answers(r, at)).toEqual([{ of: theirs, to: 'c' }]);

    await black.session.rematch(); // both asked: the second game, the former White opens it
    const ours = r.sent.at(-1) as Rematch;
    const next = black.session.game;
    const n0 = await signMove(white, { game: next, seq: 0, prev: GENESIS, move: M1 });
    r.from('b', n0);
    await settle();
    expect(black.moves).toEqual([M1]);
    at = r.sent.length;
    r.from('c', sync(0)); // a spectator that saw nothing
    r.from('d', sync(1, 'g', [white.pub])); // a spectator stuck at the end of the first game, with White's ask
    r.from('b', sync(1, next)); // White, up to date
    await settle();
    expect(answers(r, at)).toEqual([
      { of: win, to: 'c' },
      { of: theirs, to: 'c' },
      { of: ours, to: 'c' },
      { of: n0, to: 'c' },
      { of: ours, to: 'd' },
      { of: n0, to: 'd' },
    ]);
  });

  it('asks again on a live move or ask for a game it never had, never on one for a game it left', async () => {
    const { r, black, white } = await hostWithWhite();
    await blackWins(black);
    r.from('b', await signRematch(white, { game: 'g' }));
    await black.session.rematch(); // the second game
    const next = black.session.game;
    const at = r.sent.length;
    r.from('b', await signMove(white, { game: 'g', seq: 1, prev: GENESIS, move: M1 })); // the game we left
    r.from('b', await signRematch(white, { game: 'g' }));
    await settle();
    expect(r.sent.length).toBe(at);
    r.from('b', await signMove(white, { game: 'later', seq: 0, prev: GENESIS, move: M1 }));
    r.from('b', await signRematch(white, { game: 'later' }));
    await settle();
    expect(r.sent.slice(at)).toEqual([sync(0, next), sync(0, next)]);
    expect(black.refused).toEqual(['wrong-game', 'stale-rematch', 'wrong-game', 'stale-rematch']);
  });

  it('a live move ahead of its log makes a peer ask again: a move that overtook the answer is not lost', async () => {
    const { m, black, white } = await playing();
    const watcher = await player(m.end('c'), 2);
    await settle(); // seated as a spectator: a move before the roster would be refused for want of a seat
    await play(black, M1);
    m.drop('c');
    await play(white, M2); // lost on the way to the spectator
    m.mend('c'); // no reconnect: nobody noticed
    await play(black, M3); // the spectator sees a gap, asks, and both players answer
    expect(watcher.judge.played).toEqual([M1, M2, M3]);
    expect(watcher.refused).toEqual(['out-of-order']);
    expect(syncsIn(m.sent.filter((s) => s.from === 'c').map((s) => s.m))).toHaveLength(2); // on Hello, on the gap
  });

  it('heals the stuck room of #198 without a reconnect: the first move of the new game shows the gap', async () => {
    const { m, black, white } = await playing(WIN);
    await black.session.rematch(); // reaches White
    m.drop('b');
    await white.session.rematch(); // lost: White starts the new game, Black waits in the finished one
    await settle();
    m.mend('b');
    expect(black.session.game).toBe('g');
    await play(white, M1); // the former White opens the new game
    expect(black.session.game).toBe(await nextGameId('g'));
    expect(black.judge.played).toEqual([M1]);
    expect(black.refused).toEqual(['wrong-game']);
    expect(white.refused).toEqual([]);
  });

  it('two up-to-date peers answer each other nothing, however often they reconnect', async () => {
    const { m, black, white } = await playing(M1, WIN);
    await black.session.rematch();
    await settle();
    const syncs = () => syncsIn(m.sent.map((s) => s.m)).length;
    const before = syncs();
    for (let i = 0; i < 3; i++) {
      m.back('b');
      await settle(); // ends, so no message keeps answering another
    }
    expect(syncs()).toBe(before + 6); // one Sync per peer and reconnect
    expect(missedIn(m.sent)).toEqual([]);
    expect(black.refused).toEqual([]);
    expect(white.refused).toEqual([]);
    expect(white.session.askedRematch(1)).toBe(true);
  });
});
