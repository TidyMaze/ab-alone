import { DIRECTIONS, axialTo3D, cellIndex, type Axial, type Move } from './board';

/** Length of the slide-and-fade of an ejected marble, from docs/specs/world.md section 7. */
export const EJECT_MS = 600;
/** How far past the rim the marble slides, in cell spacings. */
const SLIDE = 1.5;

export interface Ejection {
  cell: Axial;
  side: number;
}

export interface EjectTrack {
  from: { x: number; z: number };
  to: { x: number; z: number };
  durationMs: number;
  fade: boolean;
}

/** The marble a move pushed off the board: the last cell of the push line, walking from the first
 * moved marble along the move direction. Null when the marble count did not change. */
export function findEjection(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  mv: Move,
): Ejection | null {
  const count = (b: ArrayLike<number>): number => Array.from(b).filter((v) => v !== 0).length;
  if (count(before) === count(after)) return null;
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  let [q, r] = mv.cells[0]!;
  while (cellIndex(q + dq, r + dr) !== -1) [q, r] = [q + dq, r + dr];
  return { cell: [q, r], side: before[cellIndex(q, r)]! };
}

/** Path of an ejected marble: slides off the board along the push direction and fades. Reduced
 * motion gives a zero-duration track: the marble just disappears. */
export function ejectTrack(cell: Axial, dir: number, reducedMotion: boolean): EjectTrack {
  const from = axialTo3D(cell[0], cell[1]);
  const step = axialTo3D(...DIRECTIONS[dir]!);
  const start = { x: from.x, z: from.z };
  if (reducedMotion) return { from: start, to: start, durationMs: 0, fade: false };
  return {
    from: start,
    to: { x: from.x + step.x * SLIDE, z: from.z + step.z * SLIDE },
    durationMs: EJECT_MS,
    fade: true,
  };
}

/** Position and opacity of the marble `elapsedMs` after the ejection started. */
export function trackAt(track: EjectTrack, elapsedMs: number): { x: number; z: number; opacity: number } {
  const t = track.durationMs > 0 ? Math.min(1, elapsedMs / track.durationMs) : 1;
  const opacity = track.fade ? 1 - t : t < 1 ? 1 : 0;
  return {
    x: track.from.x + (track.to.x - track.from.x) * t,
    z: track.from.z + (track.to.z - track.from.z) * t,
    opacity,
  };
}
