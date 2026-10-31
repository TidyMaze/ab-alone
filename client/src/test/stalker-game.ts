// A Stalker position (#998) for the tests: four plies from the start, played by the `__playMoves` hook. Black to move
// sees White's marbles on (0,-1) and (1,-2), 1 and 2 cells from its marble on (-1,0); White's (2,-3) behind them is 3
// cells from every Black marble, hidden. Black's three marbles from (-3,2) to (-1,0) pushing NE look like 3 on 2, but
// meet 3 marbles: the move is blocked by the hidden one.
export const PLIES: number[][] = [
  [3, 4, -1, 2, -1, 3, -1, 4],
  [2, 5, 0, -3, 0, -2, 0, 0],
  [3, 4, -3, 3, -2, 2, -1, 1],
  [3, 5, 1, -4, 1, -3, 1, -2],
];
export const HIDDEN: [number, number] = [2, -3];
export const SEEN: [number, number] = [1, -2];
export const BLOCKED = { cells: [[-3, 2], [-2, 1], [-1, 0]] as [number, number][], dir: 2 };
