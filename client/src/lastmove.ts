import { cellIndex, isMarble, type Move } from './board';
import { MOTION } from './motion';
import { SLIDE_MS, pushedCells } from './slide';

/** Opacity of the ring on the last move's cells once the pulse is over: the static mark (also under reduced motion). */
export const LAST_MOVE_REST = 0.9;

/** The ring on a landing cell `elapsedMs` after the move: it rests while the marbles slide, flashes when they land,
 * then fades back to the resting mark over `--motion-base`. Reduced motion: the resting mark, no animation. */
export function lastMovePulse(elapsedMs: number, reduced: boolean): { opacity: number; scale: number } {
  const t = (elapsedMs - SLIDE_MS) / MOTION.base;
  if (reduced || t < 0 || t >= 1) return { opacity: LAST_MOVE_REST, scale: 1 };
  return { opacity: 1 - (1 - LAST_MOVE_REST) * t, scale: 1.4 - 0.4 * t };
}

/** The bridge direction codes in words, as the default camera shows them: the player's side is the bottom of the screen. */
const WAY = ['right', 'left', 'up-right', 'down-left', 'up-left', 'down-right'];

/** The HUD line after the bot's move (#1680): what it moved, which way, and how many of the player's marbles it pushed. */
export function botMoveNote(mv: Move, pushed: number): string {
  const n = mv.cells.length;
  return `Bot moved ${n} marble${n > 1 ? 's' : ''} ${WAY[mv.dir]}${pushed > 0 ? ` and pushed ${pushed} of yours` : ''}`;
}

/** How many marbles `mv` pushes on `before`: the cores (The Overseer) it also pushes are not marbles of the player's. */
export const pushedMarbles = (before: ArrayLike<number>, mv: Move): number =>
  pushedCells(before, mv).slice(mv.cells.length).filter(([q, r]) => isMarble(before[cellIndex(q, r)])).length;
