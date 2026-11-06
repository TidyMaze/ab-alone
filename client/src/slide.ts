import { MOTION } from './motion';
import { BOARD_CELLS, CORE_CODE, DIRECTIONS, axialTo3D, cellIndex, isMarble, type Axial, type Move } from './board';

/** Length of the slide of a moved marble to its new cell, ease out. */
export const SLIDE_MS: number = MOTION.base;

/** A pushed marble starts this long after the one that pushes it, per place along the line (#1560): about the time the pusher's
 * ease out takes to close the 0.28 cell gap between two marbles (spacing 1, diameter 0.72), so the chain passes the force on. */
export const STAGGER_MS = 20;
/** The stagger stops at this many places: a line of marbles and cores never waits more than 40 ms. */
const STAGGER_PLACES = 2;
/** The arrival squash (#1560, motion.md story 2): a damped dip and rebound over `--motion-fast`, the marble flattened by this
 * share at most. */
export const SQUASH_MS: number = MOTION.fast;
export const SQUASH = 0.15;

export interface SlideTrack {
  /** The new cell: the marble drawn there is the one that slides. */
  cell: Axial;
  from: { x: number; z: number };
  to: { x: number; z: number };
  durationMs: number;
  /** The wait before it starts, 0 when absent: a pushed marble leaves after the pusher, and still arrives with the move. */
  delayMs?: number;
}

/** The moment after the move when the marble is on its new cell. */
export const slideEndMs = (track: SlideTrack): number => (track.delayMs ?? 0) + track.durationMs;

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
  for (const [place, [q, r]] of pushedCells(before, mv, cells).entries()) {
    const to = cellIndex(q + dq, r + dr, cells);
    if (to === -1 || after[to] !== before[cellIndex(q, r, cells)]) continue;
    const a = axialTo3D(q, r);
    const b = axialTo3D(q + dq, r + dr);
    // The moved group goes at once; each marble it pushes waits a place longer, and arrives with the rest.
    const delay = reducedMotion ? 0 : STAGGER_MS * Math.min(Math.max(place - mv.cells.length + 1, 0), STAGGER_PLACES);
    tracks.push({
      cell: [q + dq, r + dr],
      from: { x: a.x, z: a.z },
      to: { x: b.x, z: b.z },
      durationMs: reducedMotion ? 0 : SLIDE_MS - delay,
      ...(delay > 0 && { delayMs: delay }),
    });
  }
  return tracks;
}

/** Position of the sliding marble `elapsedMs` after the move, cubic ease out, from the end of its delay. */
export function slideAt(track: SlideTrack, elapsedMs: number): { x: number; z: number } {
  const t = track.durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs - (track.delayMs ?? 0)) / track.durationMs) : 1;
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

/** The marble's height and width as drawn `elapsedMs` after the move (#1560): 1 and 1 while it slides and at rest, and for
 * 120 ms from its arrival a damped dip and rebound, flatter and wider first, then taller and thinner, the volume kept.
 * Reduced motion (a zero duration) never squashes. */
export function squashAt(track: SlideTrack, elapsedMs: number): { y: number; xz: number } {
  const t = (elapsedMs - slideEndMs(track)) / SQUASH_MS;
  if (track.durationMs === 0 || t <= 0 || t >= 1) return { y: 1, xz: 1 };
  const y = 1 - SQUASH * (1 - t) * Math.sin(2 * Math.PI * t);
  return { y, xz: 1 / Math.sqrt(y) };
}
