// The first match's bot (#1663): far weaker than Easy, so a new player wins their first game. A 1-ply mover that never looks at a reply: half of its
// moves are any legal move, the others bring marbles towards the centre, where a player's lines meet them and push them off. Pure and seeded: the same
// game plays the same. Measured in firstbot.test.ts against a random player and a greedy pusher.
import { DIRECTIONS, parseMoves, type Axial, type Move } from './board';

/** One in this many moves is any legal move. */
export const FIRST_BOT_RANDOM = 2;

/** A small seeded generator (mulberry32): a number in [0, 1) from a seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ring = ([q, r]: Axial): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/** The sum of the rings (distance from the centre) of the cells a move takes its marbles to. */
export function rimScore(move: Move): number {
  const [dq, dr] = DIRECTIONS[move.dir]!;
  return move.cells.reduce((sum, [q, r]) => sum + ring([q + dq, r + dr]), 0);
}

/** Whether a move brings its marbles closer to the centre. */
export const inward = (move: Move): boolean => rimScore(move) < move.cells.reduce((sum, cell) => sum + ring(cell), 0);

/** The first match bot's move from the flat legal moves of the side to move: any legal move one time in `FIRST_BOT_RANDOM`, else an inward one. */
export function firstBotMove(flat: ArrayLike<number>, seed: number): number[] {
  const moves = parseMoves(flat);
  const roll = seeded(seed);
  const inwards = moves.flatMap((move, i) => (inward(move) ? [i] : []));
  const pool = roll() * FIRST_BOT_RANDOM < 1 || inwards.length === 0 ? moves.map((_, i) => i) : inwards;
  const at = pool[Math.floor(roll() * pool.length)]!;
  const stride = flat.length / moves.length;
  return Array.from({ length: stride }, (_, k) => flat[at * stride + k]!);
}
