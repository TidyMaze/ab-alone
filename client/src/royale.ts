// The offline battle royale (docs/specs/rules.md section 10.4, #502): 1 player against 5 bots on the radius 8 arena.
// Pure: the game is the wasm `Royale`, passed in; main.ts draws the arena and wires the buttons. Codes and records are
// the wasm encodings (crates/abalone-wasm/src/lib.rs).
import { cellsFor, type Axial } from './board';
import { SEATS } from './marbles';

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

const DIRECTION_NAMES = ['E', 'W', 'NE', 'SW', 'NW', 'SE'];

/** The order picked, in words: its marble count and direction. */
export function orderText(order: readonly number[]): string {
  if (order.length === 0) return 'none';
  return `${order[0]} marble${order[0] === 1 ? '' : 's'} ${DIRECTION_NAMES[order[1]!]}`;
}

// The seat's tint beside its name: the name carries the seat, the tint repeats it.
const seat = (s: number): string =>
  `<span class="seat" style="background: #${SEATS[s]!.toString(16).padStart(6, '0')}" aria-hidden="true"></span>${seatName(s)}`;

function turnText({ seat: s, outcome, ejected }: Turn): string {
  return `${seat(s)}: ${outcome}${ejected >= 0 ? `, ejected ${seatName(ejected)}` : ''}`;
}

/** The HUD plate: the round, its initiative order before the reveal, the order picked, and the reveal of the last
 * round in initiative order, each order's outcome named, a fizzle marked. */
export function royaleHtml(log: RoundLog | null, order: readonly number[]): string {
  const round = nextRound(log);
  const items = (list: string[], cls: string[] = []): string => list.map((t, i) => `<li${cls[i] ? ` class="${cls[i]}"` : ''}>${t}</li>`).join('');
  return (
    `<div class="turn"><span>Battle royale · Round ${round}</span></div>` +
    `<ol class="initiative" aria-label="Initiative">${items(initiative(round).map(seat))}</ol>` +
    `<small>Your order: ${orderText(order)}</small>` +
    (log
      ? `<ol class="reveal" aria-label="Round ${log.round} reveal">${items(log.turns.map(turnText), log.turns.map((t) => t.outcome))}</ol>`
      : '')
  );
}
