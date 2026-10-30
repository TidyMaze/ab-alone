// The Echo's tells (docs/specs/game-design.md section 7.4, #859): the bonus moves a move gives the other side, from
// `Encounter.echo_tell()`, and where moved marbles land; the free moves it offers the player (#958), and the board
// after each bonus move, so each slides. Pure helpers, the meshes live in main.ts.
import { DIRECTIONS, MOVE_STRIDE, VANISHED, cellIndex, parseMoves, type Axial, type Move } from './board';
import { pushedCells } from './slide';

/** One bonus move of the tell: `skipped` when the engine would not offer it (a free move that would lose the player the game). */
export interface EchoBonus {
  mv: Move;
  skipped: boolean;
}

/** The bonus moves of `Encounter.echo_tell()`: records of 9, the skipped flag then the move record. */
export function parseEchoTell(flat: ArrayLike<number>): EchoBonus[] {
  const out: EchoBonus[] = [];
  for (let i = 0; i < flat.length; i += MOVE_STRIDE + 1) {
    const [mv] = parseMoves(Array.from(flat).slice(i + 1, i + 1 + MOVE_STRIDE));
    out.push({ mv: mv!, skipped: flat[i] === 1 });
  }
  return out;
}

/** The cells the marbles of `mv` land on. */
export function landing(mv: Move): Axial[] {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  return mv.cells.map(([q, r]) => [q + dq, r + dr] as Axial);
}

/** `before` after `mv`: the moved group and the marbles it pushes step one cell, one pushed over the rim leaves. */
export function boardAfter(before: ArrayLike<number>, mv: Move): number[] {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  const after = Array.from(before);
  const moved = pushedCells(before, mv);
  for (const [q, r] of moved) after[cellIndex(q, r)] = 0;
  for (const [q, r] of moved) {
    const to = cellIndex(q + dq, r + dr);
    if (before[to] !== undefined && before[to] !== VANISHED) after[to] = before[cellIndex(q, r)]!;
  }
  return after;
}

/** The marbles that can make one of the `free` moves, each once: the ringed ones. */
export function freeMarbles(free: Move[]): Axial[] {
  const cells: Axial[] = [];
  for (const [q, r] of free.flatMap((mv) => mv.cells)) {
    if (!cells.some(([cq, cr]) => cq === q && cr === r)) cells.push([q, r]);
  }
  return cells;
}

/** The HUD line of the offer: `offered` free moves, `onTarget` when the selection shows a free target. */
export function freeText(offered: number, onTarget: boolean): string {
  if (offered === 0) return '';
  if (onTarget) return 'Free move: the diamond target is free, then you move again';
  if (offered === 1) return 'Free move: a ringed marble moves for free, any other move declines it';
  return `Free move: ${offered} ringed moves are free, any other move declines them`;
}
