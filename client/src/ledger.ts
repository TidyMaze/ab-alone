// The Ledger (#1585, docs/specs/world.md section 12.9): the story lines the player has seen, listed in the settings menu in stage order. Data and two pure
// lookups; the ids of the lines seen are saved by lorestore.ts. The new lines of stages 3 to 5 live here (#1586, #1587): each declares its stage and holds
// no secret word of a later one (`ledger.test.ts`). The others are the lines of tally.ts and bossends.ts from stage 2 up, read through their own functions.
import { bossEndLine } from './bossends';
import { TOWN_LINES, tallyLine } from './tally';

/** Stage 3, the Medal room (the first town visited has its own ledger line, `TOWN_LINES`). "Delivered" is withheld until stage 4 (world.md 12.2). */
export const MEDAL_LINE = 'Seat 3: not on board. Not on the books as lost. Entered: breathing.';
/** Stage 4, the end of the Cargo log. */
export const CARGO_LINE = 'Outside: minus one hundred and sixty. The glass lets go of what it held. Entered as weather.';
/** Stage 5, a lost run: the player's own line. */
export const VOIDED_LINE = 'Run voided. Audit reopened. Line 0412 carries a mark from before. Entered without comment.';
/** Stage 5, appended to the terminals of the Hub. */
export const TERMINAL_LINE = 'Read count: two. Line 0412 read this first, and walked on.';

/** A body with a note of Tally under it: the device of the terminals (world.md section 4). */
export const appended = (body: string, line: string): string => `${body} Appended by TALLY: ${line}`;

/** A line of the Ledger: the `id` saved when it is seen, the `stage` that may speak it. */
export interface LedgerLine {
  id: string;
  stage: number;
  line: string;
}

const lines: LedgerLine[] = [
  { id: 'bot', stage: 2, line: tallyLine({ mode: 'bot', stage: 2 }) },
  ...TOWN_LINES.map(({ stage, line }, i) => ({ id: `town-${i}`, stage, line })),
  { id: 'medal', stage: 3, line: MEDAL_LINE },
  { id: 'cargo', stage: 4, line: CARGO_LINE },
  { id: 'voided', stage: 5, line: VOIDED_LINE },
  { id: 'terminal', stage: 5, line: TERMINAL_LINE },
  { id: 'ballast-6', stage: 6, line: tallyLine({ mode: 'boss', boss: 'ballast', stage: 6 }) },
  { id: 'ballast-7', stage: 7, line: bossEndLine('ballast', 'win', 7)! },
];

/** Every line the Ledger can list, in stage order. */
export const LEDGER: readonly LedgerLine[] = lines.sort((a, b) => a.stage - b.stage);

/** The lines whose id is in `seen` and whose stage is reached, in stage order: nothing above the player's stage is ever listed, and an id this version does not know is ignored. */
export const ledgerList = (seen: readonly string[], stage: number): LedgerLine[] => LEDGER.filter((l) => seen.includes(l.id) && l.stage <= stage);

/** The lines of the Ledger a text holds: what was shown on a plate, a page or a transcript. */
export const linesIn = (text: string): LedgerLine[] => LEDGER.filter((l) => text.includes(l.line));
