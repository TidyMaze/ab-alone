import { CELLS, type Axial } from './board';

export interface GhostEngine {
  play(mv: Int32Array): void;
  board(): ArrayLike<number>;
}

export interface Ghost {
  cell: Axial;
  side: number;
}

/** Ghost marbles of `record` played on the position reached by `history`. */
export function ghostMarbles(
  _history: number[][],
  _record: number[] | null,
  _make: () => GhostEngine,
): Ghost[] {
  return [];
}
