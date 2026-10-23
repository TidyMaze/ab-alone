import { describe, expect, it } from 'vitest';
import { OnlineSession, type Judge } from './session';
import { GENESIS, generateKeys, signMove, type MoveRecord } from './moverecord';
import { localPair, type Transport } from './transport';

const M1 = [1, 0, 0, 2, 0, 0, 0, 0];
const M2 = [2, 0, 0, 3, 0, 0, 0, 0];

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

async function player(transport: Transport, side: number) {
  const judge = new FakeJudge();
  const moves: number[][] = [];
  const refused: string[] = [];
  const states: string[] = [];
  const session = new OnlineSession({
    game: 'g',
    side,
    keys: await generateKeys(),
    transport,
    judge,
    onMove: (m) => moves.push(m),
    onRefuse: (r) => refused.push(r),
    onState: (s) => states.push(s),
  });
  return { judge, moves, refused, states, session };
}

describe('OnlineSession', () => {
  it('sends a signed move that the other side verifies, replays and reports', async () => {
    const [ta, tb] = localPair();
    const black = await player(ta, 1);
    const white = await player(tb, 2);
    black.judge.play(Int32Array.from(M1)); // the sender applied it locally first
    await black.session.send(M1);
    await settle();
    expect(white.judge.played).toEqual([M1]);
    expect(white.moves).toEqual([M1]);
    expect(white.refused).toEqual([]);
  });

  it('plays a two move exchange in order', async () => {
    const [ta, tb] = localPair();
    const black = await player(ta, 1);
    const white = await player(tb, 2);
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
    x.send(await signMove(peer, { game: 'g', seq: 0, prev: GENESIS, move: [9, 0, 0, 0, 0, 0, 0, 0] }));
    await settle();
    expect(white.judge.played).toEqual([]);
    expect(white.refused).toEqual(['illegal']);
  });

  it('refuses a forged signature and a replay, and still takes the good move', async () => {
    const [x, y] = localPair();
    const white = await player(y, 2);
    const peer = await generateKeys();
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
});
