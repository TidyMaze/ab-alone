import { describe, expect, it } from 'vitest';
import { cellIndex, cellsFor } from './board';
import { crackLeft, crackText, parseCracks, tickOffsets } from './hull';

describe('parseCracks', () => {
  it('splits the flat [q, r, turns left] records of the bridge', () => {
    expect(parseCracks([4, -1, 2, -4, 1, 1])).toEqual([
      { cell: [4, -1], left: 2 },
      { cell: [-4, 1], left: 1 },
    ]);
    expect(parseCracks([])).toEqual([]);
  });

  it('refuses a length that is not a multiple of 3', () => {
    expect(() => parseCracks([4, -1])).toThrow('crack array length 2 is not a multiple of 3');
  });
});

describe('crackLeft', () => {
  it('maps each cracked cell index to its turns left', () => {
    const left = crackLeft([{ cell: [4, -1], left: 2 }]);
    expect(left.get(cellIndex(4, -1))).toBe(2);
    expect(left.size).toBe(1);
  });

  it('indexes the cells of another board, the battle royale arena (#503)', () => {
    const arena = cellsFor(8);
    const left = crackLeft([{ cell: [0, 8], left: 1 }], arena);
    expect(left.get(cellIndex(0, 8, arena))).toBe(1);
    expect(left.get(216)).toBe(1);
  });
});

describe('crackText', () => {
  it('says nothing without cracks', () => {
    expect(crackText([])).toBe('');
  });

  it('counts the cracked cells by turns left, the soonest first', () => {
    expect(crackText([{ cell: [4, -1], left: 2 }])).toBe('Cracks: 1 cell in 2 turns');
    expect(
      crackText([
        { cell: [4, -1], left: 2 },
        { cell: [-4, 1], left: 1 },
        { cell: [0, 4], left: 2 },
      ]),
    ).toBe('Cracks: 1 cell in 1 turn · 2 cells in 2 turns');
  });
});

describe('tickOffsets', () => {
  it('gives one engraved tick per turn left, centred', () => {
    expect(tickOffsets(0)).toEqual([]);
    expect(tickOffsets(1)).toEqual([0]);
    expect(tickOffsets(2)).toEqual([-0.1, 0.1]);
  });
});
