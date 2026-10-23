import { describe, expect, it } from 'vitest';
import {
  CELLS,
  DIRECTIONS,
  MOVE_STRIDE,
  axialTo3D,
  cellAt,
  cellIndex,
  directionBetween,
  encodeMove,
  legalTargets,
  parseMoves,
  pickMove,
  type Move,
} from './board';

describe('axialTo3D', () => {
  it('puts the centre at the origin', () => {
    expect(axialTo3D(0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('moves E along +x and SE down the screen (+z)', () => {
    expect(axialTo3D(1, 0)).toEqual({ x: 1, y: 0, z: 0 });
    const se = axialTo3D(0, 1);
    expect(se.x).toBeCloseTo(0.5);
    expect(se.z).toBeCloseTo(Math.sqrt(3) / 2);
  });

  it('keeps all 6 neighbours at exactly the spacing', () => {
    for (const [dq, dr] of DIRECTIONS) {
      const p = axialTo3D(dq, dr, 2);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(2);
    }
  });
});

describe('cell order of the bridge', () => {
  it('has 61 cells', () => {
    expect(CELLS).toHaveLength(61);
  });

  it('indexes rows from r=-4, q ascending', () => {
    expect(cellIndex(0, -4)).toBe(0);
    expect(cellIndex(-1, -3)).toBe(5);
    expect(cellIndex(0, 0)).toBe(30);
    expect(cellIndex(-2, 2)).toBe(45);
    expect(cellIndex(0, 4)).toBe(60);
  });

  it('round-trips every cell', () => {
    CELLS.forEach(([q, r], i) => {
      expect(cellIndex(q, r)).toBe(i);
      expect(cellAt(i)).toEqual([q, r]);
    });
  });

  it('rejects cells off the board', () => {
    expect(cellIndex(5, 0)).toBe(-1);
    expect(cellIndex(-4, -1)).toBe(-1);
    expect(cellIndex(0, 5)).toBe(-1);
    expect(cellAt(61)).toBeUndefined();
  });
});

describe('moves records', () => {
  const flat = Int32Array.from([1, 0, 0, 4, 0, 0, 0, 0, 3, 2, -1, 3, 0, 3, 1, 3]);

  it('parses back-to-back records, dropping unused coordinates', () => {
    expect(parseMoves(flat)).toEqual([
      { cells: [[0, 4]], dir: 0 },
      { cells: [[-1, 3], [0, 3], [1, 3]], dir: 2 },
    ]);
  });

  it('rejects a flat array that is not a multiple of the stride', () => {
    expect(() => parseMoves(Int32Array.from([1, 2, 3]))).toThrow();
  });

  it('encodes a move into one padded record that parseMoves reads back', () => {
    const mv: Move = { cells: [[-1, 3], [0, 3]], dir: 5 };
    const record = encodeMove(mv);
    expect(record).toEqual([2, 5, -1, 3, 0, 3, 0, 0]);
    expect(record).toHaveLength(MOVE_STRIDE);
    expect(parseMoves(Int32Array.from(record))).toEqual([mv]);
  });
});

describe('directionBetween', () => {
  it('maps each neighbour delta to the bridge direction code', () => {
    expect(directionBetween([0, 0], [1, 0])).toBe(0); // E
    expect(directionBetween([0, 0], [-1, 0])).toBe(1); // W
    expect(directionBetween([0, 0], [1, -1])).toBe(2); // NE
    expect(directionBetween([0, 0], [-1, 1])).toBe(3); // SW
    expect(directionBetween([0, 0], [0, -1])).toBe(4); // NW
    expect(directionBetween([0, 0], [0, 1])).toBe(5); // SE
  });

  it('is -1 for the same cell and for non-neighbours', () => {
    expect(directionBetween([2, 1], [2, 1])).toBe(-1);
    expect(directionBetween([0, 0], [2, 0])).toBe(-1);
    expect(directionBetween([0, 0], [1, 1])).toBe(-1);
  });
});

describe('click to move', () => {
  const single: Move = { cells: [[0, 4]], dir: 4 };
  const sideStep: Move = { cells: [[0, 4], [1, 4]], dir: 4 };
  const push: Move = { cells: [[0, 4], [0, 3]], dir: 4 };
  const other: Move = { cells: [[2, 3]], dir: 1 };

  it('picks the legal move for the selected marble and the clicked neighbour', () => {
    expect(pickMove([other, single], [0, 4], [0, 3])).toBe(single);
  });

  it('prefers the smallest group when several legal moves contain the marble', () => {
    expect(pickMove([push, sideStep, single], [0, 4], [0, 3])).toBe(single);
    expect(pickMove([push, sideStep], [0, 4], [0, 3])).toBe(sideStep);
  });

  it('is null when the target is not a neighbour or no legal move matches', () => {
    expect(pickMove([single], [0, 4], [0, 2])).toBeNull();
    expect(pickMove([single], [0, 4], [1, 4])).toBeNull();
    expect(pickMove([single], [3, 3], [3, 2])).toBeNull();
  });

  it('lists the neighbour cells the selected marble can move to, without duplicates', () => {
    expect(legalTargets([single, push, other], [0, 4])).toEqual([[0, 3]]);
    expect(legalTargets([single, { cells: [[0, 4]], dir: 5 }], [0, 4])).toEqual([
      [0, 3],
      [0, 5],
    ]);
    expect(legalTargets([other], [0, 4])).toEqual([]);
  });
});
