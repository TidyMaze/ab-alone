// The first run (#1521, #1523, docs/specs/ui.md section 4.7): what a fresh profile gets in place of the five pages of the guide. A cold
// open of three lines, a short scripted fight that ends on its first ejection, then the Hub with The Echo as the next goal. Pure data and
// functions: main.ts draws the cards and plays the fight. Stage 1 of the story (world.md section 12.2): no line holds a secret word of a
// later stage, and every line says White and Black as the HUD does.
import { guideSeen } from './guide';
import { encodeMove, type Move } from './board';
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

/** The coach plate of the scripted fight: the push, and the end. `tally` is the note under the first Tally line of the HUD, which explains it once. */
export const COACH = {
  push: 'Roll your three White marbles into the lone Black marble on the rim. Three push one, and it goes over the edge.',
  tally: 'Tally is the ship\'s ledger. It counts every match: one seat is yours, the other is the bot\'s.',
  done: 'White ejected 1/6. Tally: "Another one over the edge." Six win a match. The Echo, the first boss, waits in the Hub.',
} as const;

const row = (cells: [number, number][], dir: number): Move => ({ cells, dir });
const E = 0;
const W = 1;
const NW = 4;

/** Six plies from the standard start, played without a click: White (side 1, the player's) rolls a line of three up the left edge
 * while Black walks one marble to the rim and plays a harmless move. The player is then to move, with nothing ejected. */
export const FIRST_FIGHT: readonly Move[] = [
  row([[-2, 2], [-2, 3], [-2, 4]], NW),
  row([[0, -2]], W),
  row([[-2, 1], [-2, 2], [-2, 3]], NW),
  row([[-1, -2]], W),
  row([[-2, 0], [-2, 1], [-2, 2]], NW),
  row([[2, -2]], E),
];

/** The obvious push of that position: the line of three against the lone Black marble on the rim (-2, -2), which it ejects. */
export const FIRST_PUSH: Move = row([[-2, -1], [-2, 0], [-2, 1]], NW);

/** The scripted fight's plies as move records, for the engine. */
export const FIRST_FIGHT_RECORDS: readonly number[][] = FIRST_FIGHT.map(encodeMove);
