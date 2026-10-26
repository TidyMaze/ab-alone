// How tense the game is, for the drone tension layers of the music (docs/specs/world.md section 7, Music; #439): the
// player's marbles in danger and the boss phase. Pure functions only: main.ts feeds them the board.
import { BOARD_CELLS, DIRECTIONS, VANISHED, cellIndex } from './board';

/** The tension level: 0 calm, 1 and 2 as each drone layer comes in. */
export type Tension = 0 | 1 | 2;

/** How many marbles of `side` the other side could push off the board in one move: a marble on the rim (or beside a
 * vanished cell, The Hull) with a longer line of foe marbles behind it, a sumito of 2 on 1, 3 on 1 or 3 on 2. */
export function rimDanger(board: ArrayLike<number>, side: number): number {
  const foe = 3 - side;
  const at = (q: number, r: number): number => board[cellIndex(q, r)] ?? VANISHED; // off the board is the void too
  return BOARD_CELLS.filter(
    ([q, r]) =>
      at(q, r) === side &&
      DIRECTIONS.some(([dq, dr]) => {
        if (at(q + dq, r + dr) !== VANISHED) return false;
        let own = 1;
        while (own < 3 && at(q - own * dq, r - own * dr) === side) own++;
        let foes = 0;
        while (foes < 3 && at(q - (own + foes) * dq, r - (own + foes) * dr) === foe) foes++;
        return own < foes;
      }),
  ).length;
}

/** The tension level: one step per marble in danger and per boss phase after the first, at most 2. */
export const tensionLevel = (danger: number, phase: number): Tension => Math.min(2, danger + phase) as Tension;
