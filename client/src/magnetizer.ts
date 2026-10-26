// The Magnetizer (docs/specs/game-design.md section 7.9, #645): marbles of either side carry a + or − polarity, and two
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

/** The marble `Encounter.announce()` names for the next assignment and its coming sign, null when none. */
export function parseAnnounce(flat: ArrayLike<number>): { cell: Axial; sign: number } | null {
  return flat.length === 3 ? { cell: [flat[0]!, flat[1]!], sign: flat[2]! } : null;
}

/** The blink of the announced marble: one cycle takes a second. */
export const BLINK_MS = 1000;

/** The opacity of the announced marble `nowMs` into the page, 1 down to 0.3 and back; steady with reduced motion. */
export const blinkAt = (nowMs: number, reduced: boolean): number => (reduced ? 1 : 0.65 + 0.35 * Math.cos((2 * Math.PI * nowMs) / BLINK_MS));

/** Player turns between two polarities, per phase: turns 3, 6, 9... in P1, the even turns in P2, every turn in P3. */
const EVERY = [3, 2, 1];

/** HUD line of the tell: the player turns to the next polarity, which comes at the start of a turn. `plies` is the
 * plies played, so the player's turn now is `floor(plies / 2) + 1`. */
export function polarityText(phase: number, plies: number): string {
  const every = EVERY[phase]!;
  if (every === 1) return 'Polarity every turn';
  const n = every - ((Math.floor(plies / 2) + 1) % every);
  return n === 1 ? 'Polarity next turn' : `Polarity in ${n} turns`;
}

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** The pale + or − bars, `long` wide, in the middle of a `size` square. */
function bars(g: CanvasRenderingContext2D, sign: number, size: number, long: number): void {
  const [half, thick] = [size / 2, Math.round(size / 8)];
  g.fillStyle = css(COUNTER.ink);
  g.fillRect(half - long / 2, half - thick / 2, long, thick);
  if (sign > 0) g.fillRect(half - thick / 2, half - long / 2, thick, long);
}

/** Draws the polarity glyph on a `size` square: a near-black disc, a pale bar across it for −, a second bar up for +.
 * Bars, not a font: the shape is the same on every machine. */
export function drawGlyph(g: CanvasRenderingContext2D, sign: number, size: number): void {
  const half = size / 2;
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.arc(half, half, half, 0, Math.PI * 2);
  g.fillStyle = css(COUNTER.plate);
  g.fill();
  bars(g, sign, size, Math.round(size * 0.6));
}

/** Draws the announce indicator on a `size` square: the coming sign on a near-black diamond with a pale edge, a shape
 * apart from the glyph's disc and the ring. */
export function drawAnnounce(g: CanvasRenderingContext2D, sign: number, size: number): void {
  const [half, edge] = [size / 2, Math.round(size / 16)];
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.moveTo(half, edge);
  g.lineTo(size - edge, half);
  g.lineTo(half, size - edge);
  g.lineTo(edge, half);
  g.closePath();
  g.fillStyle = css(COUNTER.plate);
  g.fill();
  g.lineWidth = edge;
  g.strokeStyle = css(COUNTER.ink);
  g.stroke();
  bars(g, sign, size, Math.round(size * 0.4));
}
