import { DIRECTIONS, VANISHED, axialTo3D, cellIndex, isMarble, type Axial, type Move } from './board';

/** The push of the marble one cell out, over the rim, at the pace of a pushed marble (cubic ease
 * out): the sharp inhale of docs/specs/world.md section 7. */
export const PUSH_MS = 200;
/** Then the void takes it (the thud): it falls, tumbles, stretches along the pull and fades out,
 * during the 600 ms of vacuum silence. */
export const VOID_MS = 600;
/** The whole effect, under 1.5 s (docs/specs/world.md section 5). */
export const EJECT_MS = PUSH_MS + VOID_MS;
/** Reduced motion: a plain fade, shorter than the full effect (docs/specs/tech.md 5.1). */
export const FADE_MS = 400;
/** Marble radius, for a roll without sliding. */
const MARBLE_RADIUS = 0.36;
/** In the void: the travel outward, the fall below the board, the extra spin, the twist off the roll
 * axis and the longest stretch. */
const OUT = 0.8;
const FALL = 1;
const SPIN = 1.5 * Math.PI;
const TWIST = Math.PI;
const STRETCH = 1.8;

export interface Ejection {
  cell: Axial;
  side: number;
}

export interface EjectTrack {
  kind: 'tumble' | 'fade';
  from: { x: number; z: number };
  /** Unit pull direction on the board plane. */
  dir: { x: number; z: number };
  durationMs: number;
}

/** The ejected marble at one moment. The marble sits in a holder turned by `yaw` about the vertical
 * axis so that its x axis is the pull: `along` scales it along the pull, `across` the two other
 * axes (the volume stays the same). Inside the holder the marble rolls forward by `roll` about the
 * axis across the pull and twists by `twist` about the pull. `drop` is how far it fell below its
 * height on the board. */
export interface EjectPose {
  x: number;
  z: number;
  drop: number;
  yaw: number;
  roll: number;
  twist: number;
  along: number;
  across: number;
  opacity: number;
  done: boolean;
}

/** The marble a move pushed off the board: the last cell of the push line before the rim or a
 * vanished cell, walking from the first moved marble along the move direction. Null when no marble
 * was lost, or when the only ones lost sat on cells that vanished (The Hull). */
export function findEjection(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  mv: Move,
): Ejection | null {
  const count = (b: ArrayLike<number>): number => Array.from(b).filter(isMarble).length;
  const voided = Array.from(before).filter((v, i) => isMarble(v) && after[i] === VANISHED).length;
  if (count(before) - count(after) <= voided) return null;
  const [dq, dr] = DIRECTIONS[mv.dir]!;
  let [q, r] = mv.cells[0]!;
  const open = (i: number): boolean => i !== -1 && before[i] !== VANISHED;
  while (open(cellIndex(q + dq, r + dr))) [q, r] = [q + dq, r + dr];
  return { cell: [q, r], side: before[cellIndex(q, r)]! };
}

/** The effect of an ejected marble: pushed off the board along the push direction, then into the
 * void, or with reduced motion a plain fade. */
export function ejectTrack(cell: Axial, dir: number, reducedMotion: boolean): EjectTrack {
  const from = axialTo3D(cell[0], cell[1]);
  const step = axialTo3D(...DIRECTIONS[dir]!);
  return {
    kind: reducedMotion ? 'fade' : 'tumble',
    from: { x: from.x, z: from.z },
    dir: { x: step.x, z: step.z },
    durationMs: reducedMotion ? FADE_MS : EJECT_MS,
  };
}

/** The marble `elapsedMs` after the ejection started. It rolls one cell out with the line that pushes
 * it, then falls, tumbles, stretches along the pull and fades out. Reduced motion: it fades one cell
 * out, where the push left it (its own cell now holds the marble pushed in behind it). The opacity
 * only ever falls, so the effect never flashes (docs/specs/world.md section 8). A skip jumps to the
 * end. */
export function trackAt(track: EjectTrack, elapsedMs: number, skipped = false): EjectPose {
  const ms = skipped ? track.durationMs : Math.min(Math.max(elapsedMs, 0), track.durationMs);
  const done = ms === track.durationMs;
  const yaw = Math.atan2(-track.dir.z, track.dir.x);
  const at = (d: number) => ({ x: track.from.x + track.dir.x * d, z: track.from.z + track.dir.z * d });
  if (track.kind === 'fade') {
    const opacity = 1 - ms / track.durationMs;
    return { ...at(1), drop: 0, yaw, roll: 0, twist: 0, along: 1, across: 1, opacity, done };
  }
  const push = Math.min(ms, PUSH_MS) / PUSH_MS; // progress of the push, 0 to 1
  const inVoid = Math.max(ms - PUSH_MS, 0) / VOID_MS; // progress in the void, 0 to 1
  const d = 1 - (1 - push) ** 3 + OUT * inVoid * inVoid;
  const along = 1 + (STRETCH - 1) * inVoid;
  return {
    ...at(d),
    drop: FALL * inVoid * inVoid,
    yaw,
    roll: d / MARBLE_RADIUS + SPIN * inVoid * inVoid,
    twist: TWIST * inVoid * inVoid,
    along,
    across: 1 / Math.sqrt(along),
    opacity: 1 - inVoid,
    done,
  };
}
