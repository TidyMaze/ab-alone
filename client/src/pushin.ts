// The push-in of the boss camera when a lair starts the fight (#1519, motion.md story 9): the camera starts a little farther and higher
// than its framing and eases into it over about 350 ms, so the entry is not a hard cut. The fight is live from its first frame: the
// push-in never delays a press or a key, and the first one ends it on the final framing. Reduced motion: no push-in.
import { clampDistance, clampPolar, type View } from './camera';

/** The length of the push-in, in ms. */
export const PUSH_MS = 350;
/** The start's distance, as a share of the final one (farther). */
export const PUSH_FAR = 1.25;
/** How much higher the start stands, in radians of polar angle (a smaller polar is higher up). */
export const PUSH_HIGH = 0.2;

/** The view `elapsed` ms into the push-in of a fight framed at `final`: from the farther, higher pose to `final`, eased out and clamped in
 * time (before the start: the start pose; from `PUSH_MS` on: `final` itself). The turn is never touched. */
export function pushInView(final: View, elapsed: number): View {
  const t = Math.min(1, Math.max(0, elapsed / PUSH_MS));
  if (t >= 1) return final;
  const k = 1 - (1 - t) ** 3; // ease out, 0 at the start, 1 at the end
  const from = {
    polar: clampPolar(final.polar - PUSH_HIGH),
    distance: clampDistance(final.distance * PUSH_FAR),
  };
  return {
    azimuth: final.azimuth,
    polar: from.polar + (final.polar - from.polar) * k,
    distance: from.distance + (final.distance - from.distance) * k,
  };
}

/** The push-in of the boss camera as the page plays it: started by a lair, read each frame, and ended by the first input. */
export class PushIn {
  private at = 0;
  private running = false;

  /** Whether a push-in is running: the page draws its frames until it ends. */
  get active(): boolean {
    return this.running;
  }

  /** A fight starts at `now` (ms). A lair's fight pushes in, unless reduced motion is on; any other fight does not. */
  start(now: number, { lair, reduced }: { lair: boolean; reduced: boolean }): void {
    this.running = lair && !reduced;
    this.at = now;
  }

  /** The view to draw at `now` (ms), eased from the start pose to `final`, the view that is current. `null` once none runs: the page
   * draws `final` as it is. */
  frame(final: View, now: number): View | null {
    if (!this.running) return null;
    const elapsed = now - this.at;
    if (elapsed >= PUSH_MS) {
      this.running = false;
      return null;
    }
    return pushInView(final, elapsed);
  }

  /** A press or a key at once: ends the push-in on the final framing. Returns whether one was running, so the page draws that framing. */
  snap(): boolean {
    const was = this.running;
    this.running = false;
    return was;
  }
}
