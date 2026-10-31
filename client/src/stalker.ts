// The Stalker boss (docs/specs/stalker.md): the cells the player sees, within the sight of its marbles. The engine is the
// judge of the rest.
import { CELLS, type Axial } from './board';

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** The indices of the cells within `range` of any marble of `side`: its own marbles among them. */
export function visibleCells(board: ArrayLike<number>, side: number, range: number): Set<number> {
  const own = CELLS.filter((_, i) => board[i] === side);
  return new Set(CELLS.flatMap((cell, i) => (own.some((o) => hexDistance(o, cell) <= range) ? [i] : [])));
}
