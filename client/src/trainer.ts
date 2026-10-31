// Trainer mode (#1159): a 1 vs 1 against a bot that starts with one marble and gets one more each wave, until the
// player dies. Pure functions and the personal best; main.ts runs the waves on the bridge's Engine.trainer.

import { read, write, type Store } from './quality';

const BEST_KEY = 'ab-alone.trainer-best';
/** Marbles of a full army: from the next wave on the bot keeps 14 and searches more instead. */
export const FULL_ARMY = 14;

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

/** The HUD line of a run, the wave being played and the best. The e2e tests read it. */
export const waveLine = (wave: number, best: number): string => `Trainer · wave ${wave} · best ${best}`;

export interface WaveResult {
  kind: 'won' | 'lost'; // a lost wave ends the run
  survived: number; // waves survived so far, the score
}

/** The end of `wave` by the engine's status (1 the player wins, 2 the bot wins; the engine has no draw in the Trainer). */
export const waveResult = (wave: number, status: number): WaveResult => (status === 1 ? { kind: 'won', survived: wave } : { kind: 'lost', survived: wave - 1 });

/** The lines of the result card. */
export const resultText = ({ kind, survived }: WaveResult, wave: number, best: number): string[] => [
  kind === 'won' ? `Wave ${wave} cleared` : `Fell on wave ${wave}`,
  `Waves survived: ${survived}`,
  `Best: ${best}`,
];
