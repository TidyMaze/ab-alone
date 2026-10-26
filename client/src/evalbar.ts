// Evaluation bar (#191, docs/specs/ui.md section 4): the engine's search score of the position,
// turned into the bar fill and its words. Scores come from the bridge (`Engine.evaluate`), in
// centi-marbles for the side to move.
import { sideName } from './glass';

/** A won game scores this, minus the plies to the win (`abalone_core::search::WIN`). */
export const WIN_SCORE = 1_000_000;
/** Beyond this, a score is a won or lost game, not a material count. */
const DECIDED = WIN_SCORE / 2;
/** Lead, in centi-marbles, that reaches the clamp: four ejections and their bonus. */
export const BAR_RANGE = 600;
/** The ends of the bar are kept for decided games. */
const EDGE = 0.05;

/** The score for White, whoever is to move (`1` Black, `2` White). */
const forWhite = (score: number, side: number): number => (side === 2 ? score : -score);

/** Bar fill from 0 (Black wins) to 1 (White wins), clamped short of the ends until it is decided. */
export function evalFill(score: number, side: number): number {
  const white = forWhite(score, side);
  if (Math.abs(white) > DECIDED) return white > 0 ? 1 : 0;
  return Math.min(1 - EDGE, Math.max(EDGE, 0.5 + white / (2 * BAR_RANGE)));
}

/** The bar in words: "Even", "White +1.5" (marbles), "Black winning", "Black wins" once over. */
export function evalText(score: number, side: number, glass: number): string {
  const white = forWhite(score, side);
  const leader = sideName(white > 0 ? 2 : 1, glass);
  const size = Math.abs(white);
  if (size > DECIDED) return size === WIN_SCORE ? `${leader} wins` : `${leader} winning`;
  const marbles = (size / 100).toFixed(1);
  return marbles === '0.0' ? 'Even' : `${leader} +${marbles}`;
}

/** A position to evaluate: the moves that lead to it and its side to move. */
export interface Position {
  history: number[][];
  side: number;
}

/** Keeps one evaluation in flight, always for the newest position: a position played over while
 * the worker thinks is never asked, and an answer for an older position never reaches the bar. */
export class Analyst {
  private tag = 0; // bumped by every request and by stop: an answer shows only if its tag is current
  private busy = false;
  private wanted: { position: Position; tag: number } | null = null;

  constructor(
    private readonly ask: (history: number[][]) => Promise<number>,
    private readonly show: (score: number, position: Position) => void,
    private readonly failed: () => void,
  ) {}

  /** Evaluates `position` as soon as the worker is free, instead of any older one still waiting. */
  request(position: Position): void {
    this.wanted = { position, tag: ++this.tag };
    if (!this.busy) this.next();
  }

  /** Forgets the waiting position and drops the answer in flight. */
  stop(): void {
    this.wanted = null;
    this.tag++;
  }

  private next(): void {
    const job = this.wanted;
    if (!job) return;
    this.wanted = null;
    this.busy = true;
    const done = (): void => {
      this.busy = false;
      this.next();
    };
    this.ask(job.position.history).then(
      (score) => {
        if (job.tag === this.tag) this.show(score, job.position);
        done();
      },
      () => {
        if (job.tag === this.tag) this.failed(); // the worker cannot answer (#736): the bar keeps its last score
        done();
      },
    );
  }
}
