import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, type Axial } from './board';
import {
  hexDistance,
  isCellVisible,
  STALKER_VISION_RANGE,
  visibleCells,
  filterBoardView,
} from './stalker';

describe('hexDistance', () => {
  it('returns 0 for the same cell', () => {
    expect(hexDistance([0, 0], [0, 0])).toBe(0);
    expect(hexDistance([2, -3], [2, -3])).toBe(0);
  });

  it('returns 1 for adjacent neighbours in all 6 directions', () => {
    const origin: Axial = [0, 0];
    const neighbours: Axial[] = [
      [1, 0],
      [-1, 0],
      [1, -1],
      [-1, 1],
      [0, -1],
      [0, 1],
    ];
    for (const n of neighbours) {
      expect(hexDistance(origin, n)).toBe(1);
      expect(hexDistance(n, origin)).toBe(1);
    }
  });

  it('calculates distance 2 correctly across axial axes', () => {
    expect(hexDistance([0, 0], [2, 0])).toBe(2);
    expect(hexDistance([0, 0], [0, 2])).toBe(2);
    expect(hexDistance([0, 0], [-2, 2])).toBe(2);
    expect(hexDistance([0, 0], [1, 1])).toBe(2);
    expect(hexDistance([0, 0], [-1, 2])).toBe(2);
  });

  it('calculates larger distances correctly', () => {
    expect(hexDistance([0, -4], [0, 4])).toBe(8);
    expect(hexDistance([-4, 0], [4, 0])).toBe(8);
    expect(hexDistance([-2, -2], [2, 2])).toBe(8);
    expect(hexDistance([-2, 0], [2, 0])).toBe(4);
  });
});

describe('visibleCells and filterBoardView (#784)', () => {
  it('identifies all cells within range <= 2 from a single marble', () => {
    // Board with one marble at [0, 0] (centre cell, index 30 in standard 61-cell board)
    const board = new Array(61).fill(0);
    const centreIndex = BOARD_CELLS.findIndex(([q, r]) => q === 0 && r === 0);
    board[centreIndex] = 1; // Side 1 marble

    const visible = visibleCells(board, 1, STALKER_VISION_RANGE);

    // Marble cell itself is visible
    expect(isCellVisible(visible, centreIndex)).toBe(true);

    // Any cell with distance <= 2 is visible
    for (let i = 0; i < 61; i++) {
      const d = hexDistance([0, 0], BOARD_CELLS[i]!);
      if (d <= 2) {
        expect(isCellVisible(visible, i)).toBe(true);
      } else {
        expect(isCellVisible(visible, i)).toBe(false);
      }
    }
  });

  it('unions visible cells across multiple friendly marbles', () => {
    const board = new Array(61).fill(0);
    const i1 = BOARD_CELLS.findIndex(([q, r]) => q === -4 && r === 0);
    const i2 = BOARD_CELLS.findIndex(([q, r]) => q === 4 && r === 0);
    board[i1] = 1;
    board[i2] = 1;

    const visible = visibleCells(board, 1);
    expect(visible.has(i1)).toBe(true);
    expect(visible.has(i2)).toBe(true);

    // Centre cell [0, 0] is distance 4 from both, so it is NOT visible
    const centreIndex = BOARD_CELLS.findIndex(([q, r]) => q === 0 && r === 0);
    expect(visible.has(centreIndex)).toBe(false);
  });

  it('handles side with no marbles gracefully', () => {
    const board = new Array(61).fill(0);
    const visible = visibleCells(board, 1);
    expect(visible.size).toBe(0);
  });

  it('masks enemy marbles outside visible range in filterBoardView', () => {
    const board = new Array(61).fill(0);
    const friendly = BOARD_CELLS.findIndex(([q, r]) => q === 0 && r === 4);
    const closeEnemy = BOARD_CELLS.findIndex(([q, r]) => q === 0 && r === 2); // dist 2
    const farEnemy = BOARD_CELLS.findIndex(([q, r]) => q === 0 && r === -4); // dist 8

    board[friendly] = 1;
    board[closeEnemy] = 2;
    board[farEnemy] = 2;

    const visible = visibleCells(board, 1);
    const masked = filterBoardView(board, 1, visible);

    // Friendly marble stays
    expect(masked[friendly]).toBe(1);
    // Close enemy within range <= 2 stays visible
    expect(masked[closeEnemy]).toBe(2);
    // Far enemy outside range is masked to 0
    expect(masked[farEnemy]).toBe(0);
  });
});
