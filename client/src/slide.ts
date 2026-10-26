import { BOARD_CELLS, CORE_CODE, DIRECTIONS, axialTo3D, cellIndex, isMarble, type Axial, type Move } from './board';

/** Length of the slide of a moved marble to its new cell, ease out. */
export const SLIDE_MS = 200;

export interface SlideTrack {
  /** The new cell: the marble drawn there is the one that slides. */
  cell: Axial;
  from: { x: number; z: number };
  to: { x: number; z: number };
  durationMs: number;
}

/** The cells of the marbles `mv` moves on `before`: the moved group, then the opponent marbles and the cores (The
 * Overseer) its head pushes, up to an empty cell, the rim or a vanished cell (The Hull). */
export function pushedCells(before: ArrayLike<number>, mv: Move, cells: readonly Axial[] = BOARD_CELLS): Axial[] {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  const inGroup = (q: number, r: number): boolean => mv.cells.some(([gq, gr]) => gq === q && gr === r);
  const moved: Axial[] = [...mv.cells];
  for (const [q, r] of mv.cells) {
    if (inGroup(q + dq, r + dr)) continue;
    let [pq, pr] = [q + dq, r + dr];
    while (isMarble(before[cellIndex(pq, pr, cells)]) || before[cellIndex(pq, pr, cells)] === CORE_CODE) {
      moved.push([pq, pr]);
      [pq, pr] = [pq + dq, pr + dr];
    }
  }
  return moved;
}

/** One track per marble the move slides: the moved group, then the opponent marbles its head
 * pushes. A marble pushed off the board or into a vanished cell is left to the ejection animation,
 * and a marble the board after the move does not show at its new cell (a boss special flipped it)
 * just appears. `cells` are the cells the boards hold: the battle royale arena has its own (#612). */
export function slideTracks(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  mv: Move,
  reducedMotion: boolean,
  cells: readonly Axial[] = BOARD_CELLS,
): SlideTrack[] {
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  const tracks: SlideTrack[] = [];
  for (const [q, r] of pushedCells(before, mv, cells)) {
    const to = cellIndex(q + dq, r + dr, cells);
    if (to === -1 || after[to] !== before[cellIndex(q, r, cells)]) continue;
    const a = axialTo3D(q, r);
    const b = axialTo3D(q + dq, r + dr);
    tracks.push({
      cell: [q + dq, r + dr],
      from: { x: a.x, z: a.z },
      to: { x: b.x, z: b.z },
      durationMs: reducedMotion ? 0 : SLIDE_MS,
    });
  }
  return tracks;
}

/** Position of the sliding marble `elapsedMs` after the move, cubic ease out. */
export function slideAt(track: SlideTrack, elapsedMs: number): { x: number; z: number } {
  const t = track.durationMs > 0 ? Math.min(1, elapsedMs / track.durationMs) : 1;
  const k = 1 - (1 - t) ** 3;
  return {
    x: track.from.x + (track.to.x - track.from.x) * k,
    z: track.from.z + (track.to.z - track.from.z) * k,
  };
}

/** The radius of a marble, in cell spacings. */
export const MARBLE_RADIUS = 0.36;

/** How far the sliding marble has rolled `elapsedMs` after the move (#345): without slipping, about the unit axis on
 * the board plane square to its path (up × path), by the distance travelled over the radius. */
export function rollAt(track: SlideTrack, elapsedMs: number): { axis: [number, number, number]; angle: number } {
  const p = slideAt(track, elapsedMs);
  const [dx, dz] = [track.to.x - track.from.x, track.to.z - track.from.z];
  const path = Math.hypot(dx, dz);
  return {
    axis: [dz / path, 0, -dx / path],
    angle: Math.hypot(p.x - track.from.x, p.z - track.from.z) / MARBLE_RADIUS,
  };
}
