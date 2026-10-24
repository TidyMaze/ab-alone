// The board of abalone-wasm (`Engine.board()`, 61 cell values) as text for the agent: `board`, one character per
// cell, and `ascii`, the board as `render` in abalone-cli prints it (docs/specs/mcp.md section 4.2).
import type { Cell } from './notation';

const RADIUS = 4;

/** The 61 cells in abalone-wasm board order: row by row from `r = -4` to `r = 4`, `q` ascending inside a row. */
export const CELLS: Cell[] = [];
for (let r = -RADIUS; r <= RADIUS; r++) {
  for (let q = Math.max(-RADIUS, -RADIUS - r); q <= Math.min(RADIUS, RADIUS - r); q++) CELLS.push([q, r]);
}

/** Cell values of abalone-wasm: `0` empty, `1` Black, `2` White, `3` vanished. */
const BOARD_MARKS = '.BWx';
/** abalone-cli shows a vanished cell like a cell off the board: blank. */
const ASCII_MARKS = '.BW ';

export function boardText(board: ArrayLike<number>): string {
  return Array.from(board, (value) => BOARD_MARKS[value]).join('');
}

/** A header with columns 1 to 9, then rows a (`r = -4`) to i (`r = 4`). Column n is `q = n - 5`. */
export function ascii(board: ArrayLike<number>): string {
  const size = 2 * RADIUS + 1;
  const grid = Array.from({ length: size }, () => Array<string>(size).fill(' '));
  CELLS.forEach(([q, r], i) => {
    grid[r + RADIUS]![q + RADIUS] = ASCII_MARKS[board[i]!]!;
  });
  const rows = grid.map((slots, row) => `${'abcdefghi'[row]} ${slots.join(' ')}`.trimEnd());
  return ['  1 2 3 4 5 6 7 8 9', ...rows].join('\n');
}
