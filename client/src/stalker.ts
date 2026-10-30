// Stalker (#783, #998, game-design.md section 3.4): a view rule, no move rule. The player sees the enemy marbles within
// 2 cells of their own marbles, and is offered the moves of the board as they see it: hidden cells read as empty. The
// engine stays the judge: a move a hidden marble blocks is not played, it reveals that marble (main.ts).
import { CELLS, DIRECTIONS, cellIndex, type Axial, type Move } from './board';

/** The vision range, in cells, of every marble. */
export const STALKER_RANGE = 2;

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** The indices of the cells within `range` of any marble of `side`: its own marbles among them. */
export function visibleCells(board: ArrayLike<number>, side: number, range: number = STALKER_RANGE): Set<number> {
  const own = CELLS.filter((_, i) => board[i] === side);
  return new Set(CELLS.flatMap((cell, i) => (own.some((o) => hexDistance(o, cell) <= range) ? [i] : [])));
}

/** The board as `side` sees it: the enemy marbles neither visible nor revealed are empty cells. */
export function seenBoard(board: ArrayLike<number>, side: number, visible: ReadonlySet<number>, revealed: ReadonlySet<number>): number[] {
  return Array.from(board, (v, i) => (v !== 0 && v !== side && !visible.has(i) && !revealed.has(i) ? 0 : v));
}

const at = (board: ArrayLike<number>, [q, r]: Axial): number | undefined => {
  const i = cellIndex(q, r, CELLS);
  return i < 0 ? undefined : board[i]; // undefined: off the board
};
const step = ([q, r]: Axial, dir: number, n = 1): Axial => [q + n * DIRECTIONS[dir]![0], r + n * DIRECTIONS[dir]![1]];

const has = (cells: Axial[], [q, r]: Axial): boolean => cells.some(([cq, cr]) => cq === q && cr === r);
/** An inline move runs along its own line: one marble, or a marble of the group in front of another. */
const inline = ({ cells, dir }: Move): boolean => cells.length === 1 || cells.some((c) => has(cells, step(c, dir)));
/** The marble of an inline move at the head of the line. */
const frontOf = ({ cells, dir }: Move): Axial => cells.find((c) => !has(cells, step(c, dir)))!;

function legal(board: ArrayLike<number>, side: number, mv: Move): boolean {
  if (!inline(mv)) return mv.cells.every((c) => at(board, step(c, mv.dir)) === 0); // broadside
  const front = frontOf(mv);
  let k = 0;
  while (at(board, step(front, mv.dir, k + 1)) === 3 - side) k++;
  const beyond = at(board, step(front, mv.dir, k + 1));
  if (k === 0) return beyond === 0;
  return k < mv.cells.length && beyond !== side; // a sumito: empty or off the board beyond the pushed marbles
}

/** The standard moves of `side` on a 61-cell board: groups of 1 to 3 in line, inline (with the sumito) or broadside. */
export function seenMoves(board: ArrayLike<number>, side: number): Move[] {
  const moves: Move[] = [];
  CELLS.forEach((start, i) => {
    if (board[i] !== side) return;
    for (let dir = 0; dir < 6; dir++) if (legal(board, side, { cells: [start], dir })) moves.push({ cells: [start], dir });
    for (const axis of [0, 2, 5]) {
      // E, NE, SE: each group of 2 or 3 is listed once, from its start along the axis
      for (let n = 2; n <= 3; n++) {
        const cells = Array.from({ length: n }, (_, k) => step(start, axis, k));
        if (!cells.every((c) => at(board, c) === side)) break;
        for (let dir = 0; dir < 6; dir++) if (legal(board, side, { cells, dir })) moves.push({ cells, dir });
      }
    }
  });
  return moves;
}

const sameCells = (a: Axial[], b: Axial[]): boolean => a.length === b.length && a.every((c) => has(b, c));

/** The engine's legal move of the same marbles and direction as the seen move, or null when a hidden marble blocks it. */
export function resolveSeen(legalMoves: Move[], mv: Move): Move | null {
  return legalMoves.find((m) => m.dir === mv.dir && sameCells(m.cells, mv.cells)) ?? null;
}

/** The hidden marble a seen move runs into, if any: the first one in the line of marbles in front of an inline move.
 * The cells 1 and 2 ahead are always in range, so it is the third pushed marble, and the ones behind it stay hidden. A
 * broadside's targets touch the group: never hidden. Hidden: the real board holds what the seen board does not. */
export function blockers(board: ArrayLike<number>, seen: ArrayLike<number>, mv: Move): number[] {
  if (!inline(mv)) return [];
  for (let c = step(frontOf(mv), mv.dir); at(board, c) !== undefined && at(board, c) !== 0; c = step(c, mv.dir)) {
    if (at(board, c) !== at(seen, c)) return [cellIndex(c[0], c[1], CELLS)];
  }
  return [];
}

/** The cells a seen move changes and what lands there, as the ghosts of a real move (ghost.ts): the group and the
 * marbles it pushes one cell on, those off the board gone, the cells that keep their marble left out. */
export function seenGhosts(board: ArrayLike<number>, mv: Move): { cell: Axial; side: number }[] {
  const ghosts = mv.cells.map((c) => ({ cell: step(c, mv.dir), side: at(board, c)! }));
  if (inline(mv)) {
    for (let c = step(frontOf(mv), mv.dir); at(board, c); c = step(c, mv.dir)) ghosts.push({ cell: step(c, mv.dir), side: at(board, c)! });
  }
  return ghosts.filter(({ cell, side }) => at(board, cell) !== undefined && at(board, cell) !== side);
}

/** The HUD note of a Stalker game: the bot sees the whole board, and a blocked move reveals a marble. */
export const stalkerNote = (revealed: boolean): string =>
  ` · Stalker: the bot is not fogged${revealed ? ' · A hidden marble blocks that move: play again' : ''}`;
