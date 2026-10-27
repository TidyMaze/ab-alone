import { BOARD_CELLS, type Axial } from './board';

/** Stalker mode vision range in hex units (#784). */
export const STALKER_VISION_RANGE = 2;

/**
 * Calculates the hexagonal distance between two axial coordinates.
 * In axial hex coordinates, the distance is max(|dq|, |dr|, |dq + dr|).
 */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/**
 * Calculates the set of cell indices in BOARD_CELLS visible to a given side.
 * A cell is visible if its hexagonal distance to at least one friendly marble is <= range.
 */
export function visibleCells(
  board: ArrayLike<number>,
  viewerSide: number,
  range = STALKER_VISION_RANGE,
): Set<number> {
  const visible = new Set<number>();
  const friendlyCoords: Axial[] = [];

  const len = Math.min(board.length, BOARD_CELLS.length);
  for (let i = 0; i < len; i++) {
    if (board[i] === viewerSide) {
      friendlyCoords.push(BOARD_CELLS[i]!);
    }
  }

  if (friendlyCoords.length === 0) return visible;

  for (let i = 0; i < len; i++) {
    const target = BOARD_CELLS[i]!;
    for (let f = 0; f < friendlyCoords.length; f++) {
      if (hexDistance(target, friendlyCoords[f]!) <= range) {
        visible.add(i);
        break;
      }
    }
  }

  return visible;
}

/**
 * Checks if a specific cell index is visible according to a precomputed visibility set.
 */
export function isCellVisible(visibleSet: Set<number>, cellIndex: number): boolean {
  return visibleSet.has(cellIndex);
}

/**
 * Masks board state so enemy marbles outside the viewer's visible range are hidden (set to 0).
 */
export function filterBoardView(
  board: ArrayLike<number>,
  viewerSide: number,
  visibleSet: Set<number>,
): number[] {
  const result = new Array<number>(board.length);
  for (let i = 0; i < board.length; i++) {
    const val = board[i]!;
    if (val === viewerSide || visibleSet.has(i)) {
      result[i] = val;
    } else {
      result[i] = 0;
    }
  }
  return result;
}
