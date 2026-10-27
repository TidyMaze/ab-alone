// The ejected count scratched on the board frame as tally marks (#389, docs/specs/world.md section 6 rule 3). Pure:
// the slot states of each side and where they sit on the rim; main.ts draws them.
import { FRAME, type FrameShape } from './frame';

export const MARK = { step: 0.3, slots: 6 }; // from one mark to the next, in cell spacings; the slots of a side in a 1v1

export interface Mark {
  x: number;
  z: number;
  angle: number; // the turn about the vertical axis that lays a mark across the rim
  marked: boolean;
}

/** The slots of each side, side 1 first, `true` for a bone-white mark: 6 slots, one marked for each marble the side
 * lost (`lost`, per side). */
export function tallySlots(lost: readonly [number, number]): [boolean[], boolean[]] {
  const side = (s: 0 | 1): boolean[] => Array.from({ length: MARK.slots }, (_, i) => i < lost[s]);
  return [side(0), side(1)];
}

/** A side's row on the middle of the rim, at that side's end: side 1 on the near right side (+z, where it starts),
 * side 2 on the far right one, so the two read as a column beside the board and clear of the phase notches (#356).
 * Centred on the side, the first slot toward the corner on the x axis. */
export function tallyRow(shape: FrameShape, side: 1 | 2, slots: boolean[]): Mark[] {
  const [a, b] = [shape.inner[0]!, shape.inner[side === 1 ? 1 : 5]!];
  const normal = (side === 1 ? 1 : -1) * (Math.PI / 6);
  const [nx, nz] = [Math.cos(normal), Math.sin(normal)];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const [tx, tz] = [(b.x - a.x) / length, (b.z - a.z) / length];
  const [cx, cz] = [(a.x + b.x) / 2 + (nx * FRAME.rim) / 2, (a.z + b.z) / 2 + (nz * FRAME.rim) / 2];
  return slots.map((marked, i) => {
    const d = (i - (slots.length - 1) / 2) * MARK.step;
    return { x: cx + tx * d, z: cz + tz * d, angle: Math.PI / 2 - normal, marked };
  });
}
