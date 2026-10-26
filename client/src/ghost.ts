import { BOARD_CELLS, isMarble, type Axial } from './board';

export interface GhostEngine {
  play(mv: Int32Array): void;
  board(): ArrayLike<number>;
}

export interface Ghost {
  cell: Axial;
  side: number;
}

/** Ghost marbles of `record` played on the position reached by `history`: every cell that holds a
 * marble after the move and held something else before (the moved marbles and a pushed one). A cell
 * that vanishes in that ply is no ghost. The engine is the only judge: a move it rejects gives none. */
export function ghostMarbles(
  history: number[][],
  record: number[] | null,
  make: () => GhostEngine,
): Ghost[] {
  if (!record) return [];
  const engine = make();
  for (const mv of history) engine.play(Int32Array.from(mv));
  const before = Array.from(engine.board());
  try {
    engine.play(Int32Array.from(record));
  } catch {
    return [];
  }
  const after = engine.board();
  return BOARD_CELLS.flatMap((cell, i) =>
    isMarble(after[i]) && after[i] !== before[i] ? [{ cell, side: after[i]! }] : [],
  );
}
