// How tense the game is, for the drone tension layers of the music (docs/specs/world.md section 7, Music; #439): the
// player's marbles in danger and the boss phase. Pure functions only: main.ts feeds them the board.
import { BOARD_CELLS, DIRECTIONS, VANISHED, cellIndex } from './board';
import type { Charge } from './unstable';

/** The tension level: 0 calm, 1 and 2 as each drone layer comes in. */
export type Tension = 0 | 1 | 2;

/** How many marbles of `side` the other side could push off the board in one move: a marble on the rim (or beside a
 * vanished cell, The Hull) with a longer line of foe marbles behind it, a sumito of 2 on 1, 3 on 1 or 3 on 2. In The
 * Unstable Core a marble weighs 1 + its `charges` and the pushers must outweigh the line (the engine's weighted rule). */
export function rimDanger(board: ArrayLike<number>, side: number, charges: readonly Charge[] = []): number {
  const foe = 3 - side;
  const weights = new Map(charges.map(({ cell: [q, r], n }) => [cellIndex(q, r), 1 + n]));
  const weight = (q: number, r: number): number => weights.get(cellIndex(q, r)) ?? 1;
  const at = (q: number, r: number): number => board[cellIndex(q, r)] ?? VANISHED; // off the board is the void too
  return BOARD_CELLS.filter(
    ([q, r]) =>
      at(q, r) === side &&
      DIRECTIONS.some(([dq, dr]) => {
        if (at(q + dq, r + dr) !== VANISHED) return false;
        let own = 0;
        let held = 0;
        while (at(q - own * dq, r - own * dr) === side) held += weight(q - own * dq, r - own * dr), own++;
        let pushers = 0;
        for (let k = 0; k < 3 && at(q - (own + k) * dq, r - (own + k) * dr) === foe; k++) pushers += weight(q - (own + k) * dq, r - (own + k) * dr);
        return held < pushers;
      }),
  ).length;
}

/** The tension level: one step per marble in danger and per boss phase after the first, at most 2. */
export const tensionLevel = (danger: number, phase: number): Tension => Math.min(2, danger + phase) as Tension;
