import { describe, expect, test } from 'vitest';
import { ascii, boardText, CELLS } from './board';
import { newEngine } from './engine';

/** Board bytes with the given cells set, everything else empty. */
function bytes(marks: Record<string, number>): Uint8Array {
  return Uint8Array.from(CELLS, ([q, r]) => marks[`${q},${r}`] ?? 0);
}

describe('the 61 cells, in abalone-wasm board order', () => {
  test('row by row from r = -4 to r = 4, q ascending inside a row', () => {
    expect(CELLS).toHaveLength(61);
    expect(CELLS[0]).toEqual([0, -4]);
    expect(CELLS[4]).toEqual([4, -4]);
    expect(CELLS[5]).toEqual([-1, -3]);
    expect(CELLS[30]).toEqual([0, 0]);
    expect(CELLS[60]).toEqual([0, 4]);
    expect(CELLS.every(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4)).toBe(true);
  });
});

describe('boardText', () => {
  test('one character per cell: . empty, B Black, W White, x vanished', () => {
    const text = boardText(bytes({ '0,-4': 2, '0,0': 1, '0,4': 3 }));
    expect(text).toHaveLength(61);
    expect(text[0]).toBe('W');
    expect(text[30]).toBe('B');
    expect(text[60]).toBe('x');
    expect(text.replace(/[WBx]/g, '')).toBe('.'.repeat(58));
  });

  test('the standard start from the engine', () => {
    // Rows of 5, 6 and 7 cells, three empty rows of 8, 9 and 8, then the mirror image.
    expect(boardText(newEngine().board())).toBe(`${'W'.repeat(11)}..WWW..${'.'.repeat(25)}..BBB..${'B'.repeat(11)}`);
  });
});

describe('ascii, as printed by render in abalone-cli', () => {
  test('renders the standard start', () => {
    const expected = [
      '  1 2 3 4 5 6 7 8 9',
      'a         W W W W W',
      'b       W W W W W W',
      'c     . . W W W . .',
      'd   . . . . . . . .',
      'e . . . . . . . . .',
      'f . . . . . . . .',
      'g . . B B B . .',
      'h B B B B B B',
      'i B B B B B',
    ].join('\n');
    expect(ascii(newEngine().board())).toBe(expected);
  });

  test('renders one black and one white marble', () => {
    const expected = [
      '  1 2 3 4 5 6 7 8 9',
      'a         . . . . W',
      'b       . . . . . .',
      'c     . . . . . . .',
      'd   . . . . . . . .',
      'e . . . . B . . . .',
      'f . . . . . . . .',
      'g . . . . . . .',
      'h . . . . . .',
      'i . . . . .',
    ].join('\n');
    expect(ascii(bytes({ '0,0': 1, '4,-4': 2 }))).toBe(expected);
  });

  test('a vanished cell is blank, like a cell off the board', () => {
    expect(ascii(bytes({ '0,4': 3, '4,0': 3 })).split('\n')).toEqual([
      '  1 2 3 4 5 6 7 8 9',
      'a         . . . . .',
      'b       . . . . . .',
      'c     . . . . . . .',
      'd   . . . . . . . .',
      'e . . . . . . . .',
      'f . . . . . . . .',
      'g . . . . . . .',
      'h . . . . . .',
      'i . . . .',
    ]);
  });
});
