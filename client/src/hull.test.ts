import { describe, expect, it } from 'vitest';
import { cellIndex } from './board';
import { crackLeft, crackText, parseCracks, tickOffsets } from './hull';

describe('parseCracks', () => {
  it('splits the flat [q, r, plies left] records of the bridge', () => {
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
  it('maps each cracked cell index to its plies left', () => {
    const left = crackLeft([{ cell: [4, -1], left: 2 }]);
    expect(left.get(cellIndex(4, -1))).toBe(2);
    expect(left.size).toBe(1);
  });
});

describe('crackText', () => {
  it('says nothing without cracks', () => {
    expect(crackText([])).toBe('');
  });

  it('counts the cracked cells by plies left, the soonest first', () => {
    expect(crackText([{ cell: [4, -1], left: 2 }])).toBe('Rim cracks: 1 cell in 2 plies');
    expect(
      crackText([
        { cell: [4, -1], left: 2 },
        { cell: [-4, 1], left: 1 },
        { cell: [0, 4], left: 2 },
      ]),
    ).toBe('Rim cracks: 1 cell in 1 ply · 2 cells in 2 plies');
  });
});

describe('tickOffsets', () => {
  it('gives one engraved tick per ply left, centred', () => {
    expect(tickOffsets(0)).toEqual([]);
    expect(tickOffsets(1)).toEqual([0]);
    expect(tickOffsets(2)).toEqual([-0.1, 0.1]);
  });
});
