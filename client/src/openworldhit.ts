// The hit moment of a troop push (#1561, docs/specs/motion.md): a short hold on the contact frame. Pure timing, kept apart so it is
// tested alone. The hold only pauses the animation clock of the push: it never waits for the player, a key press snaps the push.
import type { Axial } from './board';

/** How long the contact frame is held, in ms (40 to 60), before the slow factor. */
export const HIT_HOLD_MS = 50;

/** The clock of a push held for `hold` ms from `at`: the plain clock before, `at` during the hold, then the plain clock less the hold. */
export const heldClock = (now: number, at: number, hold: number): number => (now <= at ? now : Math.max(at, now - hold));

/** The cell a push hits: where the head of the moving line goes, which is not a cell the line leaves. Null when nothing moves. */
export function contactOf(from: Axial[], to: Axial[]): Axial | null {
  const left = (cell: Axial): boolean => from.some((old) => old[0] === cell[0] && old[1] === cell[1]);
  const head = to.find((cell, i) => (cell[0] !== from[i]![0] || cell[1] !== from[i]![1]) && !left(cell));
  return head ?? null;
}
