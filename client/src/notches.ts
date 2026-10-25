// Boss phase notches scratched on the arena frame (#356, docs/specs/world.md section 6 rule 4): one lit notch per
// boss marble left until the next phase, dark as they go, and a steady glyph at the threshold. The counts come from
// the encounter (phase_notches in crates/abalone-wasm); this places them on the rim, main.ts draws them.
import { FRAME, type FrameShape, type Point } from './frame';

export const NOTCH = { step: 0.24 }; // from one notch to the next, in cell spacings

export interface Notch extends Point {
  lit: boolean;
}

/** The row on the middle of the rim's near side, in front of the player where no marble hides it, centred: the dark
 * notches, the lit ones, then the glyph. `counts` is `[lit, dark]`; empty in the last phase, which draws nothing. */
export function notchRow(shape: FrameShape, counts: ArrayLike<number>): { notches: Notch[]; glyph: Point } | null {
  if (counts.length === 0) return null;
  const [lit, dark] = [counts[0]!, counts[1]!];
  const z = shape.inner[1]!.z + FRAME.rim / 2; // the near side faces +z
  const x = (i: number): number => (i - (lit + dark) / 2) * NOTCH.step;
  const notches = Array.from({ length: lit + dark }, (_, i) => ({ x: x(i), z, lit: i >= dark }));
  return { notches, glyph: { x: x(lit + dark), z } };
}
