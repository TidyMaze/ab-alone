// The first run (#1521, #1523, docs/specs/ui.md section 4.7): what a fresh profile gets in place of the five pages of the guide. A cold
// open of three lines, a guided first match on the standard board against a very weak bot (#1663), then the Hub with The Echo as the next goal. Pure data and
// functions: main.ts draws the cards and plays the fight. Stage 1 of the story (world.md section 12.2): no line holds a secret word of a
// later stage, and every line says White and Black as the HUD does.
import { guideSeen } from './guide';
import { DIRECTIONS, type Move } from './board';
import { read, write, type Store } from './quality';

const FIRST_RUN_KEY = 'ab-alone.firstrun';

export const firstRunDone = (store: Store): boolean => read(store, FIRST_RUN_KEY) === 'done';
/** Marked as soon as the first run starts, so it plays once even when the tab closes in the middle. */
export const markFirstRunDone = (store: Store): void => write(store, FIRST_RUN_KEY, 'done');

/** Whether the first run opens at start: a first launch on the plain URL, to a player who has not played it, saw no guide, has no
 * game saved and beat no boss (`returning`). A link (a query or a hash) keeps its page, and an automated browser, where every e2e spec
 * boots on a fresh profile, plays it only when `?firstrun` asks for it as a player's first launch. */
export const firstRunDue = (store: Store, search: string, automated: boolean, hash: string, returning: boolean): boolean =>
  !firstRunDone(store) && !returning && !guideSeen(store) && (new URLSearchParams(search).has('firstrun') || (!automated && search === '' && hash === ''));

/** The cold open: the place, the last clear visor and Tally's rule, one line each, in Tally's flat register. */
export const COLD_OPEN = {
  title: 'Mess, deck 1',
  lines: ['CSV Ballast, drifting over Hollow. Power: 11%.', 'The crew has gone Black. Yours is the last clear visor.', 'Tally keeps the count: six out, one winner.'],
} as const;

/** The coach plate of the first match (#1663): one sentence per step, `tally` the note under the first Tally line, then the end. `{Act}` is the device's verb. */
export const COACH = {
  select: '{Act} one of your White marbles, or a line of up to three touching ones, to pick it.',
  move: '{Act} a ringed cell next to it: the marbles roll there.',
  broadside: 'Now roll a line of two or three sideways, off its own axis, into free cells: a broadside move.',
  push: 'Push: roll a line head-on into Black marbles. Three push two or one, two push one, and a marble behind them blocks it. Push one off the edge.',
  free: 'That is Abalone: eject six Black marbles to win. Skip hides this plate.',
  refused: 'Not a legal move: more marbles push fewer (three push two or one, two push one), and a marble behind the target blocks the push.',
  tally: 'Tally is the ship\'s ledger. It counts every match: one seat is yours, the other is the bot\'s.',
  won: 'You won the first match. Tally: "Another one over the edge." The Echo, the first boss, waits in the Hub.',
  lost: 'Lost this one. New game starts it again: the bot is weak, a few pushes decide it.',
  draw: 'A draw. New game to try again: push the Black marbles off the edge to win.',
} as const;

/** The HUD's label of the bot in the first match, in place of its rating: it is not a rated bot. */
export const PRACTICE_BOT = 'Practice bot · easy win';

/** The steps of the guided moves, in order; `free` ends the lesson: the plate fades after the next move. */
export type MatchStep = 'select' | 'move' | 'broadside' | 'push' | 'free';

/** The pointer's verb: a touch screen taps. */
export const verb = (coarse: boolean): string => (coarse ? 'Tap' : 'Click');

/** The line of a step for a device; a pointer that is not coarse also has the keyboard, named once on the first step. */
export function stepLine(step: MatchStep, coarse: boolean): string {
  const line = COACH[step].replace('{Act}', verb(coarse));
  return step === 'select' && !coarse ? `${line} The arrow keys and Enter work too.` : line;
}

/** A move that rolls a line of two or three sideways: more than one marble, off its own axis. The axis is read from the cells sorted by (q, r), whatever order the move lists them in: its step is E, NE or SE, and opposite directions share a pair (`dir >> 1`). */
export function isBroadside(move: Move): boolean {
  if (move.cells.length < 2) return false;
  const [first, ...rest] = [...move.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const last = rest[rest.length - 1]!;
  const gaps = move.cells.length - 1;
  const axis = DIRECTIONS.findIndex(([dq, dr]) => dq * gaps === last[0] - first![0] && dr * gaps === last[1] - first![1]);
  return move.dir >> 1 !== axis >> 1;
}

/** Whether a move pushes: an in-line move whose front cell has a marble of the other side ahead. `at` reads the board before the move, `mine` is the mover's side. */
export function isPush(move: Move, at: (q: number, r: number) => number, mine: number): boolean {
  if (move.cells.length < 2 || isBroadside(move)) return false;
  const [dq, dr] = DIRECTIONS[move.dir]!;
  const has = (q: number, r: number): boolean => move.cells.some((c) => c[0] === q && c[1] === r);
  const lead = move.cells.find(([q, r]) => !has(q + dq, r + dr))!;
  const ahead = at(lead[0] + dq, lead[1] + dr);
  return ahead !== 0 && ahead !== mine;
}

/** The next step: `select` waits for a selection; a move then teaches what it was: a push ends the lesson, a broadside leads to the push, any other move to the broadside. */
export function nextStep(step: MatchStep, event: { selected: number } | { move: Move; pushed: boolean }): MatchStep {
  if ('selected' in event) return step === 'select' && event.selected > 0 ? 'move' : step;
  if (step === 'free' || event.pushed) return 'free';
  if (isBroadside(event.move)) return 'push';
  return step === 'select' || step === 'move' ? 'broadside' : step;
}

