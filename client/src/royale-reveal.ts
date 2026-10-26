// The reveal of a battle royale round played out (#612, docs/specs/ui.md): each seat's turn in initiative order, its
// order sliding and pushing as in a normal game, then the breach. Pure: main.ts draws it. The boards are the wasm arena
// codes (crates/abalone-wasm/src/lib.rs); the round log gives each turn's outcome, the orders its move.
import { DIRECTIONS, MOVE_STRIDE, VANISHED, axialTo3D, cellIndex, parseMoves, type Axial, type Move } from './board';
import { EJECT_MS } from './eject';
import { ARENA, seatAt, type Outcome, type RoundLog } from './royale';
import { slideTracks, type SlideTrack } from './slide';

/** A moved turn: its slide, then a beat before the next one. */
export const STEP_MS = 350;
/** A fizzled or held turn: its seat's marbles ringed a moment. */
export const MARK_MS = 250;
/** The breach: the cracked cells sink away and their marbles fall, as long as an ejection. */
export const BREACH_MS = EJECT_MS;

const CRACKED = 8;
const isVoid = (code: number): boolean => (code & 7) === VANISHED;

/** The board after `mv`, which the engine played: the group moves, the marbles in line ahead are pushed, the last one
 * off the arena or onto a void cell is ejected. A cell keeps its crack. */
export function applyOrder(board: readonly number[], mv: Move): { board: number[]; ejected: Axial | null } {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  const at = (q: number, r: number): number => cellIndex(q, r, ARENA);
  const moved: Axial[] = [...mv.cells];
  for (const [q, r] of mv.cells) {
    if (mv.cells.some(([gq, gr]) => gq === q + dq && gr === r + dr)) continue;
    for (let [pq, pr] = [q + dq, r + dr]; seatAt(board[at(pq, pr)] ?? 0) >= 0; [pq, pr] = [pq + dq, pr + dr]) moved.push([pq, pr]);
  }
  const next = [...board];
  for (const [q, r] of moved) next[at(q, r)]! &= CRACKED;
  let ejected: Axial | null = null;
  for (const [q, r] of moved) {
    const to = at(q + dq, r + dr);
    if (to === -1 || isVoid(board[to]!)) ejected = [q, r];
    else next[to]! |= board[at(q, r)]! & 7;
  }
  return { board: next, ejected };
}

/** The direction from `cell` that leads away from the centre the most, for a marble the void takes. */
export function outward([q, r]: Axial): number {
  const p = axialTo3D(q, r);
  const away = DIRECTIONS.map(([dq, dr]) => {
    const d = axialTo3D(dq, dr);
    return d.x * p.x + d.z * p.z;
  });
  return away.indexOf(Math.max(...away));
}

/** A marble the void takes, pulled along `dir`. */
export interface Fall {
  cell: Axial;
  seat: number;
  dir: number;
}
export interface Step {
  seat: number;
  outcome: Outcome;
  board: number[]; // the arena once the turn is played
  tracks: SlideTrack[];
  ejected: Fall | null;
  start: number;
  ms: number;
}
export interface Reveal {
  steps: Step[];
  /** The arena before the void, the marbles on the voided cells taken off; the indices of those cells. */
  breach: { board: number[]; voids: number[]; falls: Fall[]; start: number; ms: number };
  total: number;
}

// The board for slideTracks: a marble 1, so a move slides whichever seat it pushes.
const plain = (board: readonly number[]): number[] => board.map((c) => (isVoid(c) ? VANISHED : seatAt(c) >= 0 ? 1 : 0));

/** The round played out from the arena `before` it, its `orders` as `resolve` took them, its log and the arena after. */
export function buildReveal(before: ArrayLike<number>, orders: ArrayLike<number>, log: RoundLog, after: ArrayLike<number>): Reveal {
  const moves = new Map<number, Move>();
  for (let i = 0; i < orders.length; i += MOVE_STRIDE + 1)
    moves.set(orders[i]!, parseMoves(Array.from(orders).slice(i + 1, i + 1 + MOVE_STRIDE))[0]!);
  let board = Array.from(before);
  let start = 0;
  const steps = log.turns.map(({ seat, outcome }): Step => {
    const step: Step = { seat, outcome, board, tracks: [], ejected: null, start, ms: outcome === 'out' ? 0 : MARK_MS };
    if (outcome === 'moved') {
      const mv = moves.get(seat)!;
      const played = applyOrder(board, mv);
      step.tracks = slideTracks(plain(board), plain(played.board), mv, false, ARENA);
      if (played.ejected) step.ejected = { cell: played.ejected, seat: seatAt(board[cellIndex(...played.ejected, ARENA)]!), dir: mv.dir };
      step.board = board = played.board;
      step.ms = STEP_MS;
    }
    start += step.ms;
    return step;
  });
  const voids = board.flatMap((c, i) => (!isVoid(c) && after[i] === VANISHED ? [i] : []));
  const falls = voids.flatMap((i) => (seatAt(board[i]!) >= 0 ? [{ cell: ARENA[i]!, seat: seatAt(board[i]!), dir: outward(ARENA[i]!) }] : []));
  const breach = { board: board.map((c, i) => (voids.includes(i) ? c & CRACKED : c)), voids, falls, start, ms: voids.length ? BREACH_MS : 0 };
  return { steps, breach, total: start + breach.ms };
}

/** How many log lines show `ms` into the reveal: the turns started, a turn that takes no time with the next one. */
export const shownAt = (reveal: Reveal, ms: number): number => reveal.steps.filter((s) => s.start <= ms).length;

/** How far a voided disc has sunk `ms` into the breach, in cell spacings: faster and faster, one by its end. */
export const sinkAt = (ms: number): number => Math.min(ms / BREACH_MS, 1) ** 2;
