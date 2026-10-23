// Pure board logic for the client: no DOM, no three.js, no WASM. Encodings come from the header of
// crates/abalone-wasm/src/lib.rs.

export type Axial = readonly [q: number, r: number];

/** A move as the bridge sees it: 1 to 3 marbles in line, one direction code. */
export interface Move {
  cells: Axial[];
  dir: number;
}

export const RADIUS = 4;
export const MOVE_STRIDE = 8;

/** Neighbour deltas, the index is the bridge direction code: E, W, NE, SW, NW, SE. */
export const DIRECTIONS: readonly Axial[] = [
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, 1],
  [0, -1],
  [0, 1],
];

/** The 61 cells in the bridge order: rows from r=-4, q ascending inside a row. */
export const CELLS: readonly Axial[] = (() => {
  const cells: Axial[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = Math.max(-RADIUS, -RADIUS - r); q <= Math.min(RADIUS, RADIUS - r); q++) {
      cells.push([q, r]);
    }
  }
  return cells;
})();

/** Pointy-top layout: E is +x, rows go down the screen with +r (+z). `spacing` is the distance
 * between two neighbour centres. */
export function axialTo3D(q: number, r: number, spacing = 1): { x: number; y: number; z: number } {
  return { x: spacing * (q + r / 2), y: 0, z: spacing * (Math.sqrt(3) / 2) * r };
}

/** Index of a cell in the bridge board array, `-1` off the board. */
export function cellIndex(q: number, r: number): number {
  return CELLS.findIndex(([cq, cr]) => cq === q && cr === r);
}

export function cellAt(index: number): Axial | undefined {
  return CELLS[index];
}

/** Splits the flat `legal_moves` array into moves. */
export function parseMoves(flat: ArrayLike<number>): Move[] {
  if (flat.length % MOVE_STRIDE !== 0) {
    throw new Error(`move array length ${flat.length} is not a multiple of ${MOVE_STRIDE}`);
  }
  const moves: Move[] = [];
  for (let i = 0; i < flat.length; i += MOVE_STRIDE) {
    const cells: Axial[] = [];
    for (let k = 0; k < flat[i]!; k++) cells.push([flat[i + 2 + 2 * k]!, flat[i + 3 + 2 * k]!]);
    moves.push({ cells, dir: flat[i + 1]! });
  }
  return moves;
}

/** One record for `Engine.play`, unused coordinates padded with 0. */
export function encodeMove(mv: Move): number[] {
  const record = [mv.cells.length, mv.dir, 0, 0, 0, 0, 0, 0];
  mv.cells.forEach(([q, r], i) => {
    record[2 + 2 * i] = q;
    record[3 + 2 * i] = r;
  });
  return record;
}

/** Direction code from one cell to a neighbour, `-1` if they are not neighbours. */
export function directionBetween(from: Axial, to: Axial): number {
  return DIRECTIONS.findIndex(([dq, dr]) => from[0] + dq === to[0] && from[1] + dr === to[1]);
}

/** The legal move for "selected marble, then clicked neighbour". When several groups contain the
 * marble (a single step, a side step, an inline push) the smallest group wins. */
export function pickMove(moves: Move[], selected: Axial, target: Axial): Move | null {
  const dir = directionBetween(selected, target);
  const matching = moves.filter(
    (mv) => mv.dir === dir && mv.cells.some(([q, r]) => q === selected[0] && r === selected[1]),
  );
  return matching.reduce<Move | null>(
    (best, mv) => (best === null || mv.cells.length < best.cells.length ? mv : best),
    null,
  );
}

/** Neighbour cells the selected marble can be moved towards, in direction-code order. */
export function legalTargets(moves: Move[], selected: Axial): Axial[] {
  return DIRECTIONS.flatMap(([dq, dr]): Axial[] => {
    const target: Axial = [selected[0] + dq, selected[1] + dr];
    return pickMove(moves, selected, target) ? [target] : [];
  });
}
