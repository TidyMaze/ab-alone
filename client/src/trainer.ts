// Trainer mode (#1159): a 1 vs 1 against a bot that starts with one marble and gets one more each wave, until the
// player runs out of marbles. Pure functions and the personal best; main.ts runs the waves on the bridge's Engine.trainer.

import { read, write, type Store } from './quality';

const BEST_KEY = 'ab-alone.trainer-best';
/** Marbles of a full army: from the next wave on the bot keeps 14 and searches more instead. */
export const FULL_ARMY = 14;
/** The pool of marbles the player can lose over the whole run: each marble pushed off costs one, and so does each draw
 * (a lone bot marble can run for ever, so a draw by repetition or idle plies is a win that still costs a marble). */
export const MARBLES = 6;

/** The most waves survived in one run, 0 before the first. */
export function readBest(store: Store): number {
  const best = Number(read(store, BEST_KEY));
  return Number.isInteger(best) && best > 0 ? best : 0;
}

/** Keeps `survived` waves when it is the most yet. */
export function recordBest(store: Store, survived: number): void {
  if (survived > readBest(store)) write(store, BEST_KEY, String(survived));
}

/** The bot's search budget at `wave`, from the normal `base`: 10 % more per wave past a full army, at most 3 times. */
export const trainerBudget = (wave: number, base: number): number => Math.round(base * Math.min(3, 1 + Math.max(0, wave - FULL_ARMY) / 10));

/** The HUD line of a run: the wave being played, the best and the marbles left in the pool. The e2e tests read it. */
export const waveLine = (wave: number, best: number, lost: number): string => `Trainer · wave ${wave} · best ${best} · Marbles left ${Math.max(0, MARBLES - lost)}/${MARBLES}`;

export interface WaveResult {
  kind: 'won' | 'drawn' | 'lost'; // a clear, a draw that cost a marble, or the end of the run
  survived: number; // waves survived so far, the score
  lost: number; // marbles lost over the run so far
}

/** The end of `wave` for a run that had lost `before` marbles: the marbles the bot pushed off this wave `ejected`, and one
 * more when the wave was `drawn`. The run is over once the pool is empty, and the score is the wave before. */
export function waveResult(wave: number, before: number, ejected: number, drawn: boolean): WaveResult {
  const lost = before + ejected + (drawn ? 1 : 0);
  if (lost >= MARBLES) return { kind: 'lost', survived: wave - 1, lost };
  return { kind: drawn ? 'drawn' : 'won', survived: wave, lost };
}

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Tally's line at the start of a wave (#1174): the drill, the bot's marbles in words up to twelve. Optional flavour. */
export function drillLine(wave: number): string {
  const opponents = Math.min(wave, FULL_ARMY);
  return `Drill: wave ${wave}. Opponents: ${WORDS[opponents - 1] ?? opponents}. Seated.`;
}

/** Tally's line on the result card (#1174): the waves filed and the best on record. */
export const filedLine = (survived: number, best: number): string => `${survived > 0 ? `Wave ${survived}` : 'No wave'} filed. Best on record: ${best}.`;

/** The lines of the result card. */
export const resultText = ({ kind, survived, lost }: WaveResult, wave: number, best: number): string[] => [
  { won: `Wave ${wave} cleared`, drawn: `Wave ${wave} stalled: a draw costs a marble`, lost: `Fell on wave ${wave}` }[kind],
  `Waves survived: ${survived}`,
  `Marbles left: ${Math.max(0, MARBLES - lost)}/${MARBLES}`,
  `Best: ${best}`,
  filedLine(survived, best),
];
