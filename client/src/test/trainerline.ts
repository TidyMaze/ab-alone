// Trainer test fixtures (#1159): 11 plies that win wave 1, Black first. The bot's single marble is pushed off the rim
// after White's moves, all legal on `Engine.trainer(1)`. Played by the `__playMoves` hook in the unit and e2e tests.
export const WAVE_1_WIN: number[][] = [
  [3, 2, -4, 4, -3, 3, -2, 2],
  [1, 3, 0, -2, 0, 0, 0, 0],
  [3, 2, -3, 4, -2, 3, -1, 2],
  [1, 3, -1, -1, 0, 0, 0, 0],
  [3, 2, -3, 3, -2, 2, -1, 1],
  [1, 3, -2, 0, 0, 0, 0, 0],
  [1, 0, -4, 3, 0, 0, 0, 0],
  [1, 3, -3, 1, 0, 0, 0, 0],
  [3, 4, -2, 2, -2, 3, -2, 4],
  [1, 5, -4, 2, 0, 0, 0, 0],
  [2, 1, -3, 3, -2, 3, 0, 0],
];
