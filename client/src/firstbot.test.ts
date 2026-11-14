import './test/openworldwasm';
import { Engine } from 'edgefall-wasm';
import { describe, expect, it } from 'vitest';
import { cellIndex, DIRECTIONS, encodeMove, parseMoves, type Move } from './board';
import { FIRST_BOT_RANDOM, firstBotMove, inward, rimScore, seeded } from './firstbot';

// The first match's bot (#1663): far weaker than Easy, measured over 200 seeded games each against a random mover and a greedy pusher.

const flat = (moves: Move[]): number[] => moves.flatMap(encodeMove);

describe('the seeded generator', () => {
  it('gives the same numbers for a seed, in [0, 1), and others for another seed', () => {
    const a = seeded(7);
    const b = seeded(7);
    const run = [a(), a(), a()];
    expect(run).toEqual([b(), b(), b()]);
    for (const x of run) expect(x >= 0 && x < 1).toBe(true);
    expect(seeded(8)()).not.toBe(run[0]);
  });
});

describe('the moves', () => {
  it('scores a move by the rings its marbles land on, and tells an inward move', () => {
    expect(rimScore({ cells: [[0, 0]], dir: 0 })).toBe(1);
    expect(rimScore({ cells: [[3, 0]], dir: 0 })).toBe(4);
    expect(rimScore({ cells: [[3, 0], [2, 0]], dir: 1 })).toBe(2 + 1);
    expect(inward({ cells: [[3, 0]], dir: 1 })).toBe(true);
    expect(inward({ cells: [[3, 0]], dir: 0 })).toBe(false);
    expect(inward({ cells: [[0, 0]], dir: 0 })).toBe(false);
  });

  it('plays any legal move one time in FIRST_BOT_RANDOM, else an inward one, the same for a seed', () => {
    const moves: Move[] = [{ cells: [[3, 0]], dir: 1 }, { cells: [[3, 0]], dir: 0 }, { cells: [[0, 3]], dir: 5 }];
    const inwardRecord = encodeMove(moves[0]!).join();
    let outward = 0;
    for (let seed = 0; seed < 300; seed++) {
      const move = firstBotMove(flat(moves), seed);
      if (move.join() !== inwardRecord) outward++;
      expect(firstBotMove(flat(moves), seed)).toEqual(move);
    }
    expect(FIRST_BOT_RANDOM).toBe(2);
    expect(outward).toBeGreaterThan(300 / FIRST_BOT_RANDOM / 3 * (2 / 3)); // two of the three moves are outward, only on a random roll
    expect(outward).toBeLessThan(300 / 2);
  });

  it('plays an outward move when no move goes inward', () => {
    const only = flat([{ cells: [[3, 0]], dir: 0 }]);
    expect(firstBotMove(only, 1)).toEqual(only);
  });
});

/** A greedy player: ejects when it can, else pushes, else brings a marble towards the centre. */
function greedy(engine: Engine, roll: () => number): Int32Array {
  const moves = parseMoves(engine.legal_moves());
  const board = engine.board();
  const mine = engine.to_move();
  const at = (q: number, r: number): number => (cellIndex(q, r) < 0 ? -1 : board[cellIndex(q, r)]!);
  const score = (move: Move): number => {
    const [dq, dr] = DIRECTIONS[move.dir]!;
    const has = (q: number, r: number): boolean => move.cells.some((c) => c[0] === q && c[1] === r);
    const lead = move.cells.find(([q, r]) => !has(q + dq, r + dr))!;
    if (move.cells.length > 1 && has(lead[0] - dq, lead[1] - dr)) {
      let [q, r] = [lead[0] + dq, lead[1] + dr];
      let pushed = 0;
      while (at(q, r) > 0 && at(q, r) !== mine) [q, r, pushed] = [q + dq, r + dr, pushed + 1];
      if (pushed > 0) return at(q, r) === -1 ? 1000 : 100;
    }
    return -rimScore(move) + roll() * 0.5;
  };
  let best = moves[0]!;
  let top = -Infinity;
  for (const move of moves) {
    const value = score(move);
    if (value > top) [top, best] = [value, move];
  }
  return Int32Array.from(encodeMove(best));
}

/** Plays `games` seeded games, the bot as side 2 against `mover` as side 1: the wins of the player and of the bot, the draws, and the plies of each game. */
function tally(games: number, mover: (engine: Engine, roll: () => number) => Int32Array): { player: number; bot: number; draws: number; plies: number[] } {
  const result = { player: 0, bot: 0, draws: 0, plies: [] as number[] };
  for (let game = 0; game < games; game++) {
    const engine = new Engine();
    const roll = seeded(game + 1000);
    let ply = 0;
    for (; engine.status() === 0; ply++) {
      engine.play(engine.to_move() === 2 ? Int32Array.from(firstBotMove(engine.legal_moves(), game * 1000 + ply)) : mover(engine, roll));
    }
    result.plies.push(ply);
    if (engine.status() === 1) result.player++;
    else if (engine.status() === 2) result.bot++;
    else result.draws++;
  }
  return result;
}

describe('how weak it is, over 40 seeded games each (#1663; 200 each measured on the issue)', () => {
  const games = 40;

  it('never beats a random mover, and no game with one ends before the 100-plies draw: a random mover ejects almost nothing, whatever the bot', () => {
    const result = tally(games, (engine, roll) => {
      const moves = engine.legal_moves();
      const i = Math.floor(roll() * (moves.length / 8));
      return moves.slice(i * 8, i * 8 + 8);
    });
    expect(result.bot).toBe(0);
    expect(result.player).toBeLessThanOrEqual(games / 10); // measured 0
    expect(result.plies.filter((plies) => plies < 100).length).toBe(0);
  });

  it('loses to a greedy pusher in at least 90 % of the games and never wins one; the 6 ejections come over about 150 plies, 60 is not reachable', () => {
    const result = tally(games, greedy);
    expect(result.bot).toBe(0);
    expect(result.player).toBeGreaterThanOrEqual(games * 0.9); // 194 of 200 over 200 games, the rest are draws
    expect(Math.min(...result.plies)).toBeGreaterThan(30); // an ejection needs a contact first
  });

  it('wins none and loses most of the games to the engine\'s 1-node search', () => {
    const result = tally(30, (engine) => Int32Array.from(engine.best_move(1)));
    expect(result.bot).toBe(0);
    expect(result.player).toBeGreaterThanOrEqual(27); // measured 30 of 30
  });
});
