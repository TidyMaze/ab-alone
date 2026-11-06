// What a special marble does, on the HUD of a rogue-lite fight (docs/specs/roguelite.md section 31, #1541): a legend line for each
// kind on the board the player has not met, and a card with the rule of the marble hovered or tapped. The texts are plain words,
// the same for either side, with no word of the story above the player's stage; the numbers are the engine's (specialhelp.test.ts).
import { cellIndex, type Axial } from './board';
import { glyph, parseSpecials, SPECIAL_LOOKS } from './roguelite';
import { read, write, type Store } from './quality';

/** The short line of each kind in the legend, by the bridge's kind less 1. */
export const GIST: readonly string[] = [
  'weighs 2 in a push',
  'never pushed off',
  'bursts when pushed off',
  'weighs 3 in a push',
  'never off; guards one ahead',
  'bursts 2 cells away',
  'pulls a foe 1 cell closer',
  'blocks the first push',
  'bursts on its 3rd turn',
  'returns once if pushed off',
];

/** The rule of each kind in the card, by the bridge's kind less 1. */
export const RULES: readonly string[] = [
  'Weighs 2 in a push, on either side. A lone Heavy pushes 1 plain marble, and it takes 3 plain marbles to push it.',
  'Never leaves the board: a push that would throw it off is not allowed, and a burst leaves it in place.',
  'When it is pushed off it bursts: each marble next to its last cell moves 1 cell away from it, off the board if there is no cell.',
  'Weighs 3 in a push, on either side. A lone Heavy+ pushes 2 plain marbles, and it takes 4 plain marbles to push it.',
  'An Anchor that also keeps the marble in front of it in a pushed line on the board: that push is not allowed.',
  'Bursts like a Spark, but each marble next to its last cell moves up to 2 cells away.',
  'After a move that moved it, it pulls one enemy marble 2 cells away in line, if the cell between is free, 1 cell closer.',
  'The first push that would move it fails: nothing moves, the push costs the turn, and the Shield becomes a plain marble.',
  "On its side's third turn it bursts: the marble leaves the board and its neighbours move 1 cell away.",
  'When it is thrown off the board it comes back once, as a plain marble on its side\'s back row. That is no ejection.',
];

/** A special marble on the board: its cell, its kind (the bridge's) and the side it belongs to (1 the player's). */
export interface Mark {
  cell: Axial;
  kind: number;
  side: number;
}

/** The special marbles on `board`, from the bridge's records `flat`. */
export const marksOn = (board: ArrayLike<number>, flat: ArrayLike<number>): Mark[] =>
  parseSpecials(flat).map(({ cell, kind }) => ({ cell, kind, side: board[cellIndex(cell[0], cell[1])]! }));

/** The card of a marble: its name, whose it is (side 1 is the player's) and its rule; a Bomb says its `turns` left. */
export const cardText = (kind: number, side: number, turns?: number): string =>
  `${SPECIAL_LOOKS[kind - 1]!.name} (${side === 1 ? 'yours' : "the bot's"}): ${RULES[kind - 1]}${turns === undefined ? '' : ` ${turns} turn${turns === 1 ? '' : 's'} left.`}`;

/** The legend of the HUD: a pressable line per kind in `kinds`, none without a kind. While a `card` shows (a marble hovered, or a line
 * pressed) it takes the place of the lines, as a button of its own kind: a second tap puts it away, and the plate does not grow. */
export function legendHtml(kinds: number[], card: { kind: number; text: string } | null): string {
  if (card) return `<div class="specials"><button type="button" class="special-card" data-special="${card.kind}">${card.text}</button></div>`;
  const lines = kinds.map((kind) => `<button type="button" class="special" data-special="${kind}">${glyph(kind)}<b>${SPECIAL_LOOKS[kind - 1]!.name}</b> ${GIST[kind - 1]}</button>`);
  return lines.length ? `<div class="specials">${lines.join('')}</div>` : '';
}

const MET_KEY = 'ab-alone.roguelite.met';
const met = (store: Store): number[] => (read(store, MET_KEY) ?? '').split(',').filter(Boolean).map(Number);

/** The kinds of special marble the player has met in a fight, kept in the browser: a fight's legend shows the kinds on its board
 * that were not met in an earlier fight, and the whole fight keeps its lines. */
export class Legend {
  private before: number[] = [];
  private seen = new Set<number>();
  constructor(private readonly store: Store) {}

  /** A fight starts: the kinds met so far are the ones its legend leaves out. */
  begin(): void {
    this.before = met(this.store);
    this.seen.clear();
  }

  /** The kinds of `present`, those on the board now, that were not met before this fight; they count as seen. */
  fresh(present: number[]): number[] {
    present.forEach((kind) => this.seen.add(kind));
    return present.filter((kind) => !this.before.includes(kind));
  }

  /** The fight is over: the kinds seen in it are met for good. */
  end(): void {
    const all = met(this.store);
    const added = [...this.seen].filter((kind) => !all.includes(kind));
    if (added.length) write(this.store, MET_KEY, [...all, ...added].join(','));
    this.seen.clear();
  }
}
