// A pass (#1301): 21 plies of `Engine.trainer(1)`, Black first. Black walls the bot's single marble in on the corner
// (4,0) with (3,0), (3,1) and, last, (4,-2) stepping to (4,-1): White has no legal move, so its turn passes and Black
// is to move again. Played by the `__playMoves` hook in the unit and e2e tests.
export const WALLED_IN: number[][] = [
  [1, 2, 1, 3, 0, 0, 0, 0],
  [1, 0, 0, -2, 0, 0, 0, 0],
  [1, 2, 2, 2, 0, 0, 0, 0],
  [1, 0, 1, -2, 0, 0, 0, 0],
  [1, 2, 0, 3, 0, 0, 0, 0],
  [1, 0, 2, -2, 0, 0, 0, 0],
  [1, 2, 1, 2, 0, 0, 0, 0],
  [1, 5, 3, -2, 0, 0, 0, 0],
  [1, 2, 2, 1, 0, 0, 0, 0],
  [1, 0, 3, -1, 0, 0, 0, 0],
  [1, 2, 0, 2, 0, 0, 0, 0],
  [1, 5, 4, -1, 0, 0, 0, 0],
  [1, 4, -2, 2, 0, 0, 0, 0],
  [1, 4, 4, 0, 0, 0, 0, 0],
  [1, 2, 1, 1, 0, 0, 0, 0],
  [1, 5, 4, -1, 0, 0, 0, 0],
  [1, 2, 2, 0, 0, 0, 0, 0],
  [1, 4, 4, 0, 0, 0, 0, 0],
  [1, 2, 3, -1, 0, 0, 0, 0],
  [1, 5, 4, -1, 0, 0, 0, 0],
  [1, 5, 4, -2, 0, 0, 0, 0],
];
