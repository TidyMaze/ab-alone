import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, cellIndex, type Axial } from './board';
import { boardAfter, freeMarbles, freeText, landing, parseEchoTell } from './echo';

describe('parseEchoTell', () => {
  it('reads records of 9 of the bridge: the skipped flag, then the move', () => {
    expect(parseEchoTell([0, 1, 5, 0, -2, 0, 0, 0, 0, 1, 2, 4, 1, -1, 2, -1, 0, 0])).toEqual([
      { mv: { cells: [[0, -2]], dir: 5 }, skipped: false },
      { mv: { cells: [[1, -1], [2, -1]], dir: 4 }, skipped: true },
    ]);
    expect(parseEchoTell([])).toEqual([]);
  });
});

describe('landing', () => {
  it('is the cells the moved marbles land on', () => {
    expect(landing({ cells: [[0, -2]], dir: 5 })).toEqual([[0, -1]]);
    expect(landing({ cells: [[1, -1], [2, -1]], dir: 0 })).toEqual([[2, -1], [3, -1]]);
  });
});

describe('boardAfter', () => {
  // A board of the 61 cells of radius 4 with `marbles` on it, as `Encounter.board()` gives it.
  const board = (marbles: [Axial, number][]): number[] => {
    const out = BOARD_CELLS.slice(0, 61).map(() => 0);
    for (const [[q, r], side] of marbles) out[cellIndex(q, r)] = side;
    return out;
  };

  it('moves the group one cell and leaves its old cells empty', () => {
    const before = board([[[0, 2], 1]]);
    expect(boardAfter(before, { cells: [[0, 2]], dir: 4 })).toEqual(board([[[0, 1], 1]]));
  });

  it('pushes the opponent marbles ahead, and one pushed over the rim leaves the board', () => {
    const before = board([[[0, 1], 1], [[0, 2], 1], [[0, 3], 2], [[0, 4], 2]]);
    expect(boardAfter(before, { cells: [[0, 1], [0, 2]], dir: 5 })).toEqual(board([[[0, 2], 1], [[0, 3], 1], [[0, 4], 2]]));
  });
});

describe('freeMarbles', () => {
  it('is every cell of the free moves, once', () => {
    expect(freeMarbles([])).toEqual([]);
    expect(
      freeMarbles([
        { cells: [[0, 2], [0, 3]], dir: 4 },
        { cells: [[0, 3]], dir: 0 },
      ]),
    ).toEqual([[0, 2], [0, 3]]);
  });
});

describe('freeText', () => {
  it('says nothing without an offer, else what is free and that any other move declines it', () => {
    expect(freeText(0, false)).toBe('');
    expect(freeText(1, false)).toBe('Free move: a ringed marble moves for free, any other move declines it');
    expect(freeText(2, false)).toBe('Free move: 2 ringed moves are free, any other move declines them');
    expect(freeText(1, true)).toBe('Free move: the diamond target is free, then you move again');
  });
});
