import { describe, expect, test } from 'vitest';
import { ascii, BOARD_CELLS, boardText, CELLS } from './board';
import { newEncounter, newEngine } from './engine';

/** Board bytes with the given cells set, everything else empty. */
function bytes(marks: Record<string, number>): Uint8Array {
  return Uint8Array.from(CELLS, ([q, r]) => marks[`${q},${r}`] ?? 0);
}

/** Board bytes for 91 cells with the given cells set, everything else empty. */
function bytes91(marks: Record<string, number>): Uint8Array {
  return Uint8Array.from(BOARD_CELLS, ([q, r]) => marks[`${q},${r}`] ?? 0);
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

  test('renders radius 5 board with 91 cells, header 0 to A and rows a to k (#572)', () => {
    const expected = [
      '  0 1 2 3 4 5 6 7 8 9 A',
      'a           W W W W W W',
      'b         W W W W W W W',
      'c       . . . W W W . .',
      'd     . . . .   . . . .',
      'e   . . .   . .   . . .',
      'f . . . . . . . . . . .',
      'g . . .   . .   . . .',
      'h . . . .   . . . .',
      'i . . B B B . . .',
      'j B B B B B B B',
      'k . B B B B .',
    ].join('\n');
    expect(ascii(newEncounter('ballast', 1).board())).toBe(expected);
  });
});

describe('the 91 cells for radius 5 boards (#572)', () => {
  test('the first 61 are CELLS, followed by the 30 cells of ring 5', () => {
    expect(BOARD_CELLS).toHaveLength(91);
    expect(BOARD_CELLS.slice(0, 61)).toEqual(CELLS);
    const ring5 = BOARD_CELLS.slice(61);
    expect(ring5).toHaveLength(30);
    expect(ring5.every(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 5)).toBe(true);
  });
});
