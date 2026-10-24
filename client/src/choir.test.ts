import { describe, expect, it } from 'vitest';
import { ARMY_NAMES, choirText, parseArmies } from './choir';

describe('parseArmies', () => {
  it('splits the flat [q, r, army] records of the bridge', () => {
    expect(parseArmies([0, -3, 0, -1, -2, 1, 1, -1, 2])).toEqual([
      { cell: [0, -3], army: 0 },
      { cell: [-1, -2], army: 1 },
      { cell: [1, -1], army: 2 },
    ]);
    expect(parseArmies([])).toEqual([]);
  });

  it('refuses a length that is not a multiple of 3', () => {
    expect(() => parseArmies([0, -3])).toThrow('army array length 2 is not a multiple of 3');
  });
});

describe('choirText', () => {
  it('names the army that moves next, in the order of the cycle', () => {
    expect(ARMY_NAMES).toEqual(['Alto', 'Tenor', 'Bass']);
    expect(choirText(0)).toBe('Next army: Alto');
    expect(choirText(1)).toBe('Next army: Tenor');
    expect(choirText(2)).toBe('Next army: Bass');
  });

  it('says nothing when no army is in turn: another boss, or the fight is over', () => {
    expect(choirText(-1)).toBe('');
  });
});
