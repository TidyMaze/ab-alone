// The Magnetizer (docs/specs/game-design.md section 7.9, #645): the player's marbles carry a + or − polarity, and two
// opposite ones side by side repel, pushing whole lines. Pure helpers over the bridge's `polarities()` and
// `repulsions()`; the board drawing and the repulsion animation live in main.ts.
import { COUNTER } from './alien';
import { directionBetween, type Axial, type Move } from './board';

/** Integers per repulsion record: the pair, then the 61 board codes and the 61 polarities before it. */
export const REPULSION_STRIDE = 4 + 2 * 61;

export interface Repulsion {
  pair: [Axial, Axial];
  board: number[]; // the cells just before the repulsion, the codes of `Encounter.board()`
  poles: number[]; // their polarities, the codes of `Encounter.polarities()`
}

/** Splits the flat records of `Encounter.repulsions()`, in the order they happened. */
export function parseRepulsions(flat: ArrayLike<number>): Repulsion[] {
  if (flat.length % REPULSION_STRIDE !== 0) {
    throw new Error(`repulsion array length ${flat.length} is not a multiple of ${REPULSION_STRIDE}`);
  }
  const all = Array.from(flat);
  return Array.from({ length: all.length / REPULSION_STRIDE }, (_, i) => {
    const r = all.slice(i * REPULSION_STRIDE, (i + 1) * REPULSION_STRIDE);
    return { pair: [[r[0]!, r[1]!], [r[2]!, r[3]!]], board: r.slice(4, 65), poles: r.slice(65) };
  });
}

/** The two pushes of a repulsion, as one-marble moves: `b` away from `a`, then `a` away from `b`. */
export function repulsionMoves([a, b]: [Axial, Axial]): [Move, Move] {
  return [
    { cells: [b], dir: directionBetween(a, b) },
    { cells: [a], dir: directionBetween(b, a) },
  ];
}

/** HUD line of the tell: the player turns to the next polarity in P1 (every 2nd turn), every turn later. `plies` is
 * the plies played. */
export function polarityText(phase: number, plies: number): string {
  if (phase === 1) return 'Polarity every turn';
  if (phase === 2) return 'All polarities every turn';
  const n = (Math.ceil(plies / 2) + 1) % 2 === 0 ? 1 : 2;
  return `Polarity in ${n} ${n === 1 ? 'turn' : 'turns'}`;
}

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Draws the polarity glyph on a `size` square: a near-black disc, a pale bar across it for −, a second bar up for +.
 * Bars, not a font: the shape is the same on every machine. */
export function drawGlyph(g: CanvasRenderingContext2D, sign: number, size: number): void {
  const half = size / 2;
  const [long, thick] = [Math.round(size * 0.6), Math.round(size / 8)];
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.arc(half, half, half, 0, Math.PI * 2);
  g.fillStyle = css(COUNTER.plate);
  g.fill();
  g.fillStyle = css(COUNTER.ink);
  g.fillRect(half - long / 2, half - thick / 2, long, thick);
  if (sign > 0) g.fillRect(half - thick / 2, half - long / 2, thick, long);
}
