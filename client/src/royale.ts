// The offline battle royale (docs/specs/rules.md section 10.4, #502): 1 player against 5 bots on the radius 8 arena.
// Pure: the game is the wasm `Royale`, passed in; main.ts draws the arena and wires the buttons. Codes and records are
// the wasm encodings (crates/abalone-wasm/src/lib.rs).
import { cellsFor, type Axial } from './board';
import { ordinal, royaleBanner } from './endbanner';
import type { Crack } from './hull';
import { SEAT_GLYPHS, SEAT_INK, SEATS } from './marbles';

/** The 217 cells of the arena, in the order of the wasm board. */
export const ARENA: readonly Axial[] = cellsFor(8);
/** The player's seat, and the bots'. */
export const YOU = 0;
export const BOTS: readonly number[] = [1, 2, 3, 4, 5];
const SEAT_COUNT = 1 + BOTS.length;
/** The arena is drawn at half the cell spacing, in the room of the radius 4 board. */
export const ARENA_SCALE = 0.5;

/** The game as the wasm `Royale` gives it. */
export interface RoyaleGame {
  resolve(orders: Int32Array): void;
  round_log(): ArrayLike<number>;
  bot_order(seat: number): ArrayLike<number>;
}

/** The seat of a marble from its arena code, -1 for an empty or void cell. A cracked cell (+8) keeps its marble. */
export function seatAt(code: number): number {
  const c = code & 7;
  return c === 1 ? 0 : c === 2 ? 1 : c >= 4 ? c - 2 : -1;
}

/** The seats with no marble left on the arena: they are out and spectate (rules.md 10.4). */
export function outSeats(board: ArrayLike<number>): number[] {
  const held = new Set(Array.from(board, seatAt));
  return Array.from({ length: SEAT_COUNT }, (_, s) => s).filter((s) => !held.has(s));
}

export interface Standing {
  seat: number;
  place: number; // from 1, shared by a tie
  points: number;
}

/** The wasm placement (`[place, points]` per seat in seat order), best place first, seat order within a shared place;
 * empty while the game runs. */
export function standings(flat: ArrayLike<number>): Standing[] {
  const list: Standing[] = [];
  for (let i = 0; i < flat.length; i += 2) list.push({ seat: i / 2, place: flat[i]!, points: flat[i + 1]! });
  return list.sort((a, b) => a.place - b.place);
}

const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The breach warning, '' without cracks: "Breach: 48 cells void in 1 round". The cracked cells all go void together. */
export function breachText(cracks: readonly Crack[]): string {
  return cracks.length ? `Breach: ${count(cracks.length, 'cell')} void in ${count(cracks[0]!.left, 'round')}` : '';
}

export const seatName = (seat: number): string => (seat === YOU ? 'You' : `Bot ${seat}`);

/** The seats in initiative order for `round` (from 1): round k starts at seat (k - 1) mod N and goes round the list. */
export function initiative(round: number): number[] {
  return Array.from({ length: SEAT_COUNT }, (_, i) => (round - 1 + i) % SEAT_COUNT);
}

export type Outcome = 'moved' | 'fizzled' | 'held' | 'out';
export interface Turn {
  seat: number;
  outcome: Outcome;
  ejected: number; // the seat whose marble the move ejected, -1 for none
}
export interface RoundLog {
  round: number;
  turns: Turn[];
}
const OUTCOMES: readonly Outcome[] = ['moved', 'fizzled', 'held', 'out'];

/** The wasm round log, null before the first round. */
export function parseLog(flat: ArrayLike<number>): RoundLog | null {
  if (flat.length === 0) return null;
  const turns: Turn[] = [];
  for (let i = 1; i < flat.length; i += 3) turns.push({ seat: flat[i]!, outcome: OUTCOMES[flat[i + 1]!]!, ejected: flat[i + 2]! });
  return { round: flat[0]!, turns };
}

/** The round the next orders are for. */
export const nextRound = (log: RoundLog | null): number => (log ? log.round + 1 : 1);

/** One round's orders for `resolve`: the player's move record (empty for a hold), then each bot's, a hold left out. */
export function roundOrders(game: RoyaleGame, mine: readonly number[]): Int32Array {
  const orders = mine.length ? [YOU, ...mine] : [];
  for (const bot of BOTS) {
    const order = Array.from(game.bot_order(bot));
    if (order.length) orders.push(bot, ...order);
  }
  return Int32Array.from(orders);
}

/** A royale game file: the bots' seed and each round's orders, as `resolve` takes them. */
export interface RoyaleFile {
  seed: number;
  rounds: number[][];
}

/** The game of a file: a new game of its seed, its rounds replayed. */
export function loadRoyale<G extends RoyaleGame>(file: RoyaleFile, make: (seats: number, seed: number) => G): G {
  const game = make(SEAT_COUNT, file.seed);
  for (const orders of file.rounds) game.resolve(Int32Array.from(orders));
  return game;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
// The seat's tint and glyph beside its name, as on its marbles (#558): the name carries the seat, the mark repeats it.
const seat = (s: number): string => {
  const { name, points } = SEAT_GLYPHS[s]!;
  const outline = points.map(([x, y]) => `${x},${-y}`).join(' ');
  return (
    `<span class="seat" data-glyph="${name}" style="background: ${hex(SEATS[s]!)}" aria-hidden="true">` +
    `<svg viewBox="-1.3 -1.3 2.6 2.6"><polygon points="${outline}" fill="${hex(SEAT_INK)}"/></svg></span>${seatName(s)}`
  );
};

function turnText({ seat: s, outcome, ejected }: Turn): string {
  return `${seat(s)}: ${outcome}${ejected >= 0 ? `, ejected ${seatName(ejected)}` : ''}`;
}

/** What the plate shows besides the log (#503): the seats out, the cracked cells, the standings once the game is over. */
export interface RoyaleView {
  out?: readonly number[];
  cracks?: readonly Crack[];
  standings?: readonly Standing[];
}

/** The HUD plate: the round, its initiative order before the reveal (the seats out greyed), the breach warning, and
 * the reveal of the last round in initiative order, each order's outcome named, a fizzle marked.
 * Once the game is over: the end banner and each seat's place and points. */
export function royaleHtml(log: RoundLog | null, { out = [], cracks = [], standings = [] }: RoyaleView = {}): string {
  const round = nextRound(log);
  const items = (list: string[], cls: string[] = []): string => list.map((t, i) => `<li${cls[i] ? ` class="${cls[i]}"` : ''}>${t}</li>`).join('');
  const end = royaleBanner(standings, YOU);
  if (end) {
    const places = standings.map((s) => `${ordinal(s.place)} ${seat(s.seat)} · ${count(s.points, 'point')}`);
    return (
      `<div class="turn"><span>${end.title}</span></div>` +
      `<div class="end" data-anim="${end.anim}">${end.line}</div>` +
      `<ol class="placement" aria-label="Placement">${items(places)}</ol>`
    );
  }
  const seats = initiative(round);
  const breach = breachText(cracks);
  return (
    `<div class="turn"><span>Battle royale · Round ${round}</span></div>` +
    `<ol class="initiative" aria-label="Initiative">${items(seats.map(seat), seats.map((s) => (out.includes(s) ? 'out' : '')))}</ol>` +
    (breach ? `<small class="breach">${breach}</small>` : '') +
    (log
      ? `<ol class="reveal" aria-label="Round ${log.round} reveal">${items(log.turns.map(turnText), log.turns.map((t) => t.outcome))}</ol>`
      : '')
  );
}
