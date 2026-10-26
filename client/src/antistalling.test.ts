import { describe, expect, it } from 'vitest';
import init, { Engine, engine_version } from 'abalone-wasm';
import { generateKeys } from './moverecord';
import { OnlineSession } from './session';
import { localPair, type Transport } from './transport';

// Issue #187: anti-stalling (rules.md section 9) gives the same result online as in hot-seat. Unlike
// session.test.ts, the judge is the real rules engine, not a stand-in. Node's fetch cannot read a
// file:// URL, so the test reads the wasm file itself, with node:fs imported untyped: the client has
// no Node types.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/abalone-wasm/pkg/abalone_wasm_bg.wasm', import.meta.url)) });

const STRIDE = 8; // integers per move record, crates/abalone-wasm/src/lib.rs

// One marble each, there and back twice: the start position comes back a third time at ply 8.
const THERE_AND_BACK = [
  [1, 4, 0, 2, 0, 0, 0, 0], // Black (0,2) NW to (0,1)
  [1, 5, 0, -2, 0, 0, 0, 0], // White (0,-2) SE to (0,-1)
  [1, 5, 0, 1, 0, 0, 0, 0], // Black back SE to (0,2)
  [1, 4, 0, -1, 0, 0, 0, 0], // White back NW to (0,-2)
];
const REPETITION = [...THERE_AND_BACK, ...THERE_AND_BACK];

// What the HUD shows of a game's end: status (0 running, 1 or 2 won, 3 draw) and draw reason
// (0 none, 1 threefold repetition, 2 100 plies without ejection).
const result = (e: Engine): [number, number] => [e.status(), e.draw_reason()];
const position = (e: Engine): string => `${e.to_move()}:${e.board().join('')}`;

function replay(plies: number[][]): Engine {
  const e = new Engine();
  for (const mv of plies) e.play(Int32Array.from(mv));
  return e;
}

const records = (flat: Int32Array): number[][] =>
  Array.from({ length: flat.length / STRIDE }, (_, i) => Array.from(flat.subarray(i * STRIDE, (i + 1) * STRIDE)));

// `n` plies in the engine's own move order, each one ejecting nothing and reaching a position never
// seen in the game: no position can occur a third time, only the no-ejection cap can end the game.
function quietPlies(n: number): number[][] {
  const plies: number[][] = [];
  const seen = new Set([position(new Engine())]);
  while (plies.length < n) {
    const quiet = records(replay(plies).legal_moves()).find((mv) => {
      const after = replay([...plies, mv]);
      return after.ejected(1) + after.ejected(2) === 0 && !seen.has(position(after));
    });
    plies.push(quiet!);
    seen.add(position(replay(plies)));
  }
  return plies;
}

// Hot-seat, as main.ts with ?bot=off: one engine plays both sides. The result after each ply.
function hotSeat(plies: number[][]): [number, number][] {
  const e = new Engine();
  return plies.map((mv) => {
    e.play(Int32Array.from(mv));
    return result(e);
  });
}

// One online peer wired as main.ts does: its own engine is the session's judge.
async function peer(transport: Transport, side: number) {
  const p = {
    engine: new Engine(),
    refused: [] as string[],
    session: undefined as unknown as OnlineSession,
  };
  p.session = new OnlineSession({
    game: 'g',
    side,
    engine: engine_version(),
    keys: await generateKeys(),
    transport,
    judge: {
      to_move: () => p.engine.to_move(),
      play: (mv) => p.engine.play(mv),
      status: () => p.engine.status(),
      restart: () => {
        p.engine = new Engine();
      },
    },
    onMove: () => {},
    onRefuse: (reason) => p.refused.push(reason),
  });
  return p;
}

// Waits for the work of the sessions, not for a time (bug #190). One hands messages to the other while
// it works: go round until a whole pass finds no queue that grew.
async function settle(sessions: OnlineSession[]): Promise<void> {
  for (;;) {
    const queues = sessions.map((s) => s.settled);
    await Promise.all(queues);
    if (sessions.every((s, i) => s.settled === queues[i])) return;
  }
}

// Black creates the room, White joins, then they play `plies` in turn over the signed move log. The
// result on each peer after each ply.
async function online(plies: number[][]) {
  const [ta, tb] = localPair();
  const black = await peer(ta, 1);
  const white = await peer(tb, 2);
  const both = [black.session, white.session];
  await settle(both); // the Hello round trip: White is seated
  expect(white.session.role).toBe('player');
  const seen = { black: [] as [number, number][], white: [] as [number, number][] };
  for (const [i, mv] of plies.entries()) {
    const mover = i % 2 === 0 ? black : white;
    expect(mover.session.canPlay()).toBe(true);
    mover.engine.play(Int32Array.from(mv)); // main.ts plays the move on its own engine, then sends it
    await mover.session.send(mv);
    await settle(both); // the other peer verified and replayed it, or refused it
    seen.black.push(result(black.engine));
    seen.white.push(result(white.engine));
  }
  return { ...seen, refused: [...black.refused, ...white.refused] };
}

describe('online anti-stalling, real engine, #187', () => {
  it('a position seen a third time draws on both peers at the same ply as in hot-seat', async () => {
    const local = hotSeat(REPETITION);
    expect(local[3]).toEqual([0, 0]); // ply 4: the start position a second time, the game goes on
    expect(local[7]).toEqual([3, 1]); // ply 8: a third time, draw by threefold repetition
    const { black, white, refused } = await online(REPETITION);
    expect(refused).toEqual([]);
    expect(black).toEqual(local);
    expect(white).toEqual(local);
  });

  it('the 100th ply without ejection draws on both peers as in hot-seat, the 99th does not', async () => {
    const plies = quietPlies(100);
    const local = hotSeat(plies);
    expect(local[98]).toEqual([0, 0]); // ply 99: the game goes on
    expect(local[99]).toEqual([3, 2]); // ply 100: draw after 100 plies without ejection
    const { black, white, refused } = await online(plies);
    expect(refused).toEqual([]);
    expect(black).toEqual(local);
    expect(white).toEqual(local);
  });
});
