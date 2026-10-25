import { describe, expect, it } from 'vitest';
import { CELLS, cellIndex, VANISHED, type Axial } from './board';
import { rimDanger, tensionLevel } from './tension';

/** A board with only the given marbles: [cell, side] pairs, every other cell empty. */
const board = (...marbles: [Axial, number][]): number[] => {
  const b = CELLS.map(() => 0);
  for (const [[q, r], side] of marbles) b[cellIndex(q, r)] = side;
  return b;
};

describe('rimDanger, own marbles on the rim that one push could eject (world.md section 7, Music)', () => {
  it('is 0 on an empty board and with no foe in line', () => {
    expect(rimDanger(board(), 2)).toBe(0);
    expect(rimDanger(board([[0, -4], 2]), 2)).toBe(0); // alone on the rim, nobody to push it
    expect(rimDanger(board([[0, -4], 2], [[2, -2], 1], [[2, -1], 1]), 2)).toBe(0); // foes, but not in line with it
  });

  it('counts a marble on the rim with more foe marbles in line behind it: 2 push 1, 3 push 1 or 2', () => {
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 1], [[0, -2], 1]), 2)).toBe(1);
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 1], [[0, -2], 1], [[0, -1], 1]), 2)).toBe(1);
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 2], [[0, -2], 1], [[0, -1], 1], [[0, 0], 1]), 2)).toBe(1); // 3 push 2
  });

  it('is 0 when the foe line is no longer than its own: no sumito', () => {
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 1]), 2)).toBe(0); // 1 against 1
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 2], [[0, -2], 1], [[0, -1], 1]), 2)).toBe(0); // 2 against 2
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 2], [[0, -2], 2], [[0, -1], 1], [[0, 0], 1], [[1, 0], 1]), 2)).toBe(0);
    // Three own in line can never be pushed, whatever comes behind.
    expect(rimDanger(board([[0, -4], 2], [[0, -3], 2], [[0, -2], 2], [[0, -1], 1], [[0, 0], 1], [[0, 1], 1], [[0, 2], 1]), 2)).toBe(0);
  });

  it('is 0 when the line in front of it is not off the board: the marble is not on the rim that way', () => {
    // Off the rim by one cell, the foes push it onto the rim, not off.
    expect(rimDanger(board([[0, -3], 2], [[0, -2], 1], [[0, -1], 1]), 2)).toBe(0);
  });

  it('counts a marble once, however many pushes could eject it, and only that side', () => {
    // (4, -4) is a corner: pushed off E by the row and off NE by the column (SW to NE).
    const corner = board([[4, -4], 2], [[3, -4], 1], [[2, -4], 1], [[3, -3], 1], [[2, -2], 1]);
    expect(rimDanger(corner, 2)).toBe(1);
    expect(rimDanger(corner, 1)).toBe(0);
  });

  it('counts each own marble in danger', () => {
    const two = board([[0, -4], 2], [[0, -3], 1], [[0, -2], 1], [[0, 4], 2], [[0, 3], 1], [[0, 2], 1]);
    expect(rimDanger(two, 2)).toBe(2);
  });

  it('counts a push into a vanished cell (The Hull) as a push off', () => {
    const b = board([[0, -2], 2], [[0, -1], 1], [[0, 0], 1]);
    b[cellIndex(0, -3)] = VANISHED;
    expect(rimDanger(b, 2)).toBe(1);
  });
});

describe('tensionLevel, 0 to 2 from the marbles in danger and the boss phase', () => {
  it('is 0 when nothing is in danger outside a fight or in the first boss phase', () => {
    expect(tensionLevel(0, 0)).toBe(0);
  });

  it('rises by one per marble in danger and per boss phase after the first', () => {
    expect(tensionLevel(1, 0)).toBe(1);
    expect(tensionLevel(0, 1)).toBe(1);
    expect(tensionLevel(2, 0)).toBe(2);
    expect(tensionLevel(1, 1)).toBe(2);
    expect(tensionLevel(0, 2)).toBe(2);
  });

  it('never goes above 2', () => {
    expect(tensionLevel(5, 0)).toBe(2);
    expect(tensionLevel(3, 3)).toBe(2);
  });
});
