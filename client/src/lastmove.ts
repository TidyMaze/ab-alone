import { MOTION } from './motion';
import { SLIDE_MS } from './slide';

/** Opacity of the ring on the last move's cells once the pulse is over: the static mark (also under reduced motion). */
export const LAST_MOVE_REST = 0.55;

/** The ring on a landing cell `elapsedMs` after the move: it rests while the marbles slide, flashes when they land,
 * then fades back to the resting mark over `--motion-base`. Reduced motion: the resting mark, no animation. */
export function lastMovePulse(elapsedMs: number, reduced: boolean): { opacity: number; scale: number } {
  const t = (elapsedMs - SLIDE_MS) / MOTION.base;
  if (reduced || t < 0 || t >= 1) return { opacity: LAST_MOVE_REST, scale: 1 };
  return { opacity: 1 - (1 - LAST_MOVE_REST) * t, scale: 1.4 - 0.4 * t };
}
