// Hint (#192, docs/specs/ui.md section 4.2): the engine's best move for the side to move, asked on a press and
// drawn as a ghost on the board, never played. A hint belongs to the position it was asked for, its game and its
// ply: once the game moves on it is off, and an answer for an older position is never shown.

import { parseMoves, type Axial } from './board';

/** A position: the game it belongs to (the page's engine object) and the plies played in it. */
export interface Spot {
  game: object;
  ply: number;
}

/** Off, asked while the engine searches, or shown. */
export type HintState = 'off' | 'asking' | 'shown';

const same = (a: Spot | undefined, b: Spot): boolean => a?.game === b.game && a.ply === b.ply;

export class Hint {
  private on: Spot | undefined; // the position whose hint is on
  private move: number[] | null = null; // its best move, once the engine answered

  constructor(
    private readonly ask: (history: number[][]) => Promise<number[]>,
    private readonly changed: () => void,
    private readonly failed: () => void,
  ) {}

  /** A press with `history` played in `game`: asks the best move of that position, or clears its hint when it is
   * already on (the second press). */
  press(game: object, history: readonly number[][]): void {
    const spot = { game, ply: history.length };
    if (this.state(spot) !== 'off') return this.clear();
    this.on = spot;
    this.move = null;
    this.ask([...history]).then(
      (move) => {
        if (!same(this.on, spot)) return; // cleared, or asked for another position since
        this.move = move;
        this.changed();
      },
      () => {
        if (!same(this.on, spot)) return;
        this.clear(); // the engine cannot answer (#736): no hint to wait for
        this.failed();
      },
    );
    this.changed();
  }

  /** Turns the hint off, as a new selection does. */
  clear(): void {
    if (!this.on) return;
    this.on = undefined;
    this.move = null;
    this.changed();
  }

  /** The hint on `spot`, the position on the board. */
  state(spot: Spot): HintState {
    if (!same(this.on, spot)) return 'off';
    return this.move ? 'shown' : 'asking';
  }

  /** The move to draw as a ghost on `spot`, null unless its hint is shown. */
  shown(spot: Spot): number[] | null {
    return same(this.on, spot) ? this.move : null;
  }

  /** The marbles the move shown on `spot` takes (#301), none unless its hint is shown. */
  marked(spot: Spot): Axial[] {
    const move = this.shown(spot);
    return move ? parseMoves(move)[0]!.cells : [];
  }
}
