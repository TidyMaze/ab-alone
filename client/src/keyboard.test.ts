import { describe, expect, it } from 'vitest';
import type { Move } from './board';
import { announce, KEY_DIRS, legalGroups, moveFor, nextGroup } from './keyboard';

// Two groups: the single marble (0,0) with two moves, and the pair (1,0),(0,0) listed in the other order.
const moves: Move[] = [
  { cells: [[0, 0]], dir: 0 },
  { cells: [[0, 0]], dir: 5 },
  { cells: [[1, 0], [0, 1]], dir: 1 },
  { cells: [[0, 1], [1, 0]], dir: 2 },
  { cells: [[-2, 1]], dir: 3 },
];

describe('keyboard play', () => {
  it('lists each legal group once, in the order of the engine, cells in board order', () => {
    expect(legalGroups(moves)).toEqual([[[0, 0]], [[1, 0], [0, 1]], [[-2, 1]]]);
    expect(legalGroups([])).toEqual([]);
  });

  it('Tab goes to the next group and Shift+Tab to the previous one', () => {
    expect(nextGroup(moves, [], 1)).toEqual([[0, 0]]);
    expect(nextGroup(moves, [[0, 0]], 1)).toEqual([[1, 0], [0, 1]]);
    expect(nextGroup(moves, [[0, 1], [1, 0]], 1)).toEqual([[-2, 1]]);
    expect(nextGroup(moves, [[-2, 1]], -1)).toEqual([[1, 0], [0, 1]]);
    expect(nextGroup(moves, [], -1)).toEqual([[-2, 1]]);
  });

  it('past either end there is no group: focus leaves the board', () => {
    expect(nextGroup(moves, [[-2, 1]], 1)).toBeNull();
    expect(nextGroup(moves, [[0, 0]], -1)).toBeNull();
    expect(nextGroup([], [], 1)).toBeNull();
  });

  it('a selection that is not a legal group counts as no selection', () => {
    expect(nextGroup(moves, [[3, 3]], 1)).toEqual([[0, 0]]);
  });

  it('Q W E A S D map to the six directions, each once', () => {
    expect(Object.keys(KEY_DIRS).join('')).toBe('qweasd');
    expect(new Set(Object.values(KEY_DIRS)).size).toBe(6);
  });

  it('finds the legal move of the selected group in a direction, or null', () => {
    expect(moveFor(moves, [[0, 0]], 5)).toBe(moves[1]);
    expect(moveFor(moves, [[0, 1], [1, 0]], 2)).toBe(moves[3]);
    expect(moveFor(moves, [[0, 0]], 1)).toBeNull();
    expect(moveFor(moves, [], 0)).toBeNull();
  });

  it('announces the group, then the direction', () => {
    expect(announce(moves, [], -1)).toBe('no group selected');
    expect(announce(moves, [[3, 3]], 0)).toBe('no group selected');
    expect(announce(moves, [[0, 0]], -1)).toBe('group 1 of 3, 1 marble');
    expect(announce(moves, [[1, 0], [0, 1]], -1)).toBe('group 2 of 3, 2 marbles');
    expect(announce(moves, [[0, 0]], 5)).toBe('group 1 of 3, 1 marble, south-east, Enter to play');
    expect(announce(moves, [[0, 0]], 4)).toBe('group 1 of 3, 1 marble, no move north-west');
  });

  it('with a gamepad in use, the hints name its buttons (#1252)', () => {
    expect(announce(moves, [], -1, true)).toBe('no group selected, RB for a group');
    expect(announce(moves, [[0, 0]], -1, true)).toBe('group 1 of 3, 1 marble, stick to aim, LB RB to switch');
    expect(announce(moves, [[0, 0]], 5, true)).toBe('group 1 of 3, 1 marble, south-east, A to play, B to back out');
    expect(announce(moves, [[0, 0]], 4, true)).toBe('group 1 of 3, 1 marble, no move north-west');
  });
});
