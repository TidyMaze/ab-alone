// The board of abalone-wasm (`Engine.board()`, 61 or 91 cell values) as text for the agent: `board`, one character per
// cell, and `ascii`, the board as `render` in abalone-cli prints it (docs/specs/mcp.md section 4.2).
import type { Cell } from './notation';

const RADIUS = 4;

/** The 61 cells in abalone-wasm board order: row by row from `r = -4` to `r = 4`, `q` ascending inside a row. */
export const CELLS: Cell[] = [];
for (let r = -RADIUS; r <= RADIUS; r++) {
  for (let q = Math.max(-RADIUS, -RADIUS - r); q <= Math.min(RADIUS, RADIUS - r); q++) CELLS.push([q, r]);
}

const ring = ([q, r]: Cell): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/** The outer ring of The Ballast Mind's radius 5 board (#564, #572). */
export const RING5: Cell[] = [];
for (let r = -5; r <= 5; r++) {
  for (let q = -5; q <= 5; q++) {
    if (Math.abs(q + r) <= 5 && ring([q, r]) === 5) RING5.push([q, r]);
  }
}

/** The 91 cells in abalone-wasm board order: the 61 of the standard board, then ring 5 (#572). */
export const BOARD_CELLS: Cell[] = [...CELLS, ...RING5];

/** Cell values of abalone-wasm: `0` empty, `1` Black, `2` White, `3` vanished, then `4` to `7` the battle royale
 * seats (never on a boss board), `8` a core and `9` the Overseer (The Overseer, #635). */
const BOARD_MARKS = '.BWx????cO';
/** abalone-cli shows a vanished cell like a cell off the board: blank. */
const ASCII_MARKS = '.BW ????cO';

export function boardText(board: ArrayLike<number>): string {
  return Array.from(board, (value) => BOARD_MARKS[value]).join('');
}

/** A header with columns (1 to 9 for radius 4, 0 to A for radius 5), then rows a to i (or k for radius 5). */
export function ascii(board: ArrayLike<number>): string {
  const radius = board.length === 91 ? 5 : RADIUS;
  const size = 2 * radius + 1;
  const grid = Array.from({ length: size }, () => Array<string>(size).fill(' '));
  const cells = radius === 5 ? BOARD_CELLS : CELLS;
  cells.forEach(([q, r], i) => {
    grid[r + radius]![q + radius] = ASCII_MARKS[board[i]!]!;
  });
  const rowLabels = radius === 5 ? 'abcdefghijk' : 'abcdefghi';
  const header = radius === 5 ? '  0 1 2 3 4 5 6 7 8 9 A' : '  1 2 3 4 5 6 7 8 9';
  const rows = grid.map((slots, row) => `${rowLabels[row]} ${slots.join(' ')}`.trimEnd());
  return [header, ...rows].join('\n');
}
