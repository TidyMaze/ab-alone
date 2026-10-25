// The look of each marble and cell, turned at random but seeded, so the same game always looks the same:
// each marble starts turned its own way (#346) and rolls as it slides (#345), each cell disc is turned (#347).
// Pure maths; main.ts sets the meshes.
import { DIRECTIONS, cellIndex } from './board';
import { rollAt, type SlideTrack } from './slide';

/** A rotation as a unit quaternion, x, y, z, w (the order THREE.Quaternion.fromArray reads). */
export type Quat = [number, number, number, number];

// The murmur3 finaliser: every bit of the input changes about half the bits of the output.
const mix = (h: number): number => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

/** A number in [0, 1), the same for the same seed and key. */
export const random = (seed: number, key: number): number => mix(mix(seed) ^ mix(key + 0x9e3779b9)) / 2 ** 32;

const CELL_SEED = 347; // one board: the cells are turned the same way in every game

/** The turn of cell `i` (its index in the bridge order) around the vertical axis, in [0, 2π). */
export const cellTurn = (i: number): number => 2 * Math.PI * random(CELL_SEED, i);

/** The starting turn of the marble that starts on cell `i`, uniform over every rotation (Shoemake). */
export function marbleTurn(seed: number, i: number): Quat {
  const [u, v, w] = [0, 1, 2].map((n) => random(seed, i * 3 + n)) as [number, number, number];
  const [a, b] = [Math.sqrt(1 - u), Math.sqrt(u)];
  return [a * Math.sin(2 * Math.PI * v), a * Math.cos(2 * Math.PI * v), b * Math.sin(2 * Math.PI * w), b * Math.cos(2 * Math.PI * w)];
}

/** The turn of the marble on cell `i`: the one a slide carried there, else the starting turn of that cell. */
export const turnOf = (turns: ReadonlyMap<number, Quat>, seed: number, i: number): Quat => turns.get(i) ?? marbleTurn(seed, i);

// The rotation `a` after the rotation `b`.
const mul = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const about = ([x, y, z]: [number, number, number], angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
};

/** The turn of a sliding marble `elapsedMs` after the move, from `end`, its turn once at rest on its new cell. */
export function rolledTurn(track: SlideTrack, elapsedMs: number, end: Quat): Quat {
  const { axis, angle } = rollAt(track, elapsedMs);
  return mul(about(axis, angle - rollAt(track, track.durationMs).angle), end);
}

/** The turns after a move in direction `dir`: each sliding marble takes its own turn to its new cell, rolled one cell.
 * The turns given are left as they are. */
export function carryTurns(turns: ReadonlyMap<number, Quat>, seed: number, tracks: SlideTrack[], dir: number): Map<number, Quat> {
  const [dq, dr] = DIRECTIONS[dir]!;
  const next = new Map(turns);
  for (const track of tracks) {
    const [q, r] = track.cell;
    const { axis, angle } = rollAt(track, track.durationMs);
    next.set(cellIndex(q, r), mul(about(axis, angle), turnOf(turns, seed, cellIndex(q - dq, r - dr))));
  }
  return next;
}
