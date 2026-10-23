import { describe, expect, it } from 'vitest';
import { OnlineSession, type Judge } from './session';
import { GENESIS, generateKeys, hashRecord, signHello, signMove, type Keys, type MoveRecord } from './moverecord';
import { localPair, type ConnectionState, type Transport } from './transport';

const M1 = [1, 0, 0, 2, 0, 0, 0, 0];
const M2 = [2, 0, 0, 3, 0, 0, 0, 0];
const M3 = [1, 0, 1, 2, 0, 0, 0, 0];

// Stands in for the wasm engine: alternates Black then White, refuses any move starting with 9.
class FakeJudge implements Judge {
  played: number[][] = [];
  to_move(): number {
    return (this.played.length % 2) + 1;
  }
  play(mv: Int32Array): void {
    if (mv[0] === 9) throw new Error('IllegalMove');
    this.played.push(Array.from(mv));
  }
}

const settle = () => new Promise((r) => setTimeout(r, 20));

async function player(transport: Transport, side: number, seatCount = 2) {
  const judge = new FakeJudge();
  const moves: number[][] = [];
  const refused: string[] = [];
  const states: string[] = [];
  const roles: string[] = [];
  const keys = await generateKeys();
  const session = new OnlineSession({
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
  });
  return { judge, moves, refused, states, roles, keys, session };
}

// Black creates the room, White joins: both Hello messages cross before anyone plays.
async function seated() {
  const [ta, tb] = localPair();
  const black = await player(ta, 1);
  const white = await player(tb, 2);
  await settle();
  return { black, white };
}

// A raw peer on the other end of a pair, for hand made messages.
const hello = (keys: Keys, seat: number, roster: string[] = []) => signHello(keys, { game: 'g', seat, roster });

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

  it('can play only once the transport is open and it is our turn', async () => {
    let state: ConnectionState = 'connecting';
    let notify: (s: ConnectionState) => void = () => {};
    const transport: Transport = {
      get state() {
        return state;
      },
      send: () => {},
      onRecord: () => {},
      onState: (cb) => {
        notify = cb;
      },
      close: () => {},
    };
    const black = await player(transport, 1);
    expect(black.session.canPlay()).toBe(false); // waiting for the opponent: a move would never arrive
    state = 'open';
    notify('open');
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

  it('works without the optional callbacks', async () => {
    const [x, y] = localPair();
    const judge = new FakeJudge();
    const keys = await generateKeys();
    const session = new OnlineSession({ game: 'g', side: 2, keys, transport: y, judge, onMove: () => {}, onRefuse: () => {} });
    const creator = await generateKeys();
    x.send(await hello(creator, 1, [creator.pub, 'x']));
    x.close();
    await settle();
    expect(session.role).toBe('spectator');
  });
});
