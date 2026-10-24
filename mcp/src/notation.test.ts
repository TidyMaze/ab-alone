import { describe, expect, test } from 'vitest';
import { DIRECTIONS, formatMove, fromRecord, fromRecords, parseMove, toRecord, type Move } from './notation';

function parsed(input: string): Move {
  const result = parseMove(input);
  if (!result.ok) throw new Error(`expected a move, got: ${result.message}`);
  return result.move;
}

function error(input: string): string {
  const result = parseMove(input);
  if (result.ok) throw new Error(`expected an error for ${input}`);
  return result.message;
}

// The messages of `ParseError` in crates/abalone-cli/src/lib.rs, word for word (docs/specs/mcp.md section 3.1).
const EMPTY = 'empty input';
const MISSING_ARROW = "missing '>' before the direction";
const NO_CELL = "no cell before '>'";
const BAD_CELL = 'cell must look like (q,r), for example (0,0)';
const BAD_DIRECTION = 'direction must be E, W, NE, SW, NW or SE';

describe('parseMove, the notation of abalone-cli', () => {
  test('the direction codes are the abalone-wasm order', () => {
    expect(DIRECTIONS).toEqual(['E', 'W', 'NE', 'SW', 'NW', 'SE']);
  });

  test('parses a single marble in each direction', () => {
    DIRECTIONS.forEach((name, dir) => {
      expect(parsed(`(0,0)>${name}`)).toEqual({ cells: [[0, 0]], dir });
    });
  });

  test('parses a pair and a triple, keeping the cell order', () => {
    expect(parsed('(-1,2)(0,2)>E')).toEqual({ cells: [[-1, 2], [0, 2]], dir: 0 });
    expect(parsed('(0,4)(0,3)(0,2)>NW')).toEqual({ cells: [[0, 4], [0, 3], [0, 2]], dir: 4 });
  });

  test('surrounding whitespace is ignored', () => {
    expect(parsed('  (0,0)>SE \n')).toEqual(parsed('(0,0)>SE'));
  });

  test('a coordinate is a Rust i32: an optional sign, then digits', () => {
    expect(parsed('(+1,-02)>E')).toEqual({ cells: [[1, -2]], dir: 0 });
    expect(parsed('(2147483647,-2147483648)>E')).toEqual({ cells: [[2147483647, -2147483648]], dir: 0 });
    expect(error('(2147483648,0)>E')).toBe(BAD_CELL);
    expect(error('(0,-2147483649)>E')).toBe(BAD_CELL);
    expect(error('(1.5,0)>E')).toBe(BAD_CELL);
    expect(error('(-,0)>E')).toBe(BAD_CELL);
    expect(error('( 1,0)>E')).toBe(BAD_CELL);
  });

  test('rejects empty input', () => {
    expect(error('')).toBe(EMPTY);
    expect(error('   ')).toBe(EMPTY);
  });

  test('rejects a missing arrow', () => {
    expect(error('(0,0)SE')).toBe(MISSING_ARROW);
    expect(error('nope')).toBe(MISSING_ARROW);
  });

  test('rejects a direction with no cell', () => {
    expect(error('>SE')).toBe(NO_CELL);
  });

  test('rejects an unknown direction, before looking at the cells', () => {
    expect(error('(0,0)>X')).toBe(BAD_DIRECTION);
    expect(error('(0,0)>se')).toBe(BAD_DIRECTION);
    expect(error('(0,0)>E>W')).toBe(BAD_DIRECTION);
    expect(error('>X')).toBe(BAD_DIRECTION);
  });

  test('rejects malformed cells', () => {
    for (const input of ['0,0>E', '(0,0>E', '(00)>E', '(a,0)>E', '(0,x)>E', '(0,0)(1,1>E', '(0,0) (1,1)>E', '(1,2,3)>E', '((1,2)>E']) {
      expect(error(input), input).toBe(BAD_CELL);
    }
  });
});

describe('formatMove', () => {
  test('writes the cells in order, then the direction', () => {
    expect(formatMove({ cells: [[-1, 2], [0, 2]], dir: 0 })).toBe('(-1,2)(0,2)>E');
    expect(formatMove({ cells: [[0, 0]], dir: 5 })).toBe('(0,0)>SE');
  });

  test('gives back the canonical form of what was parsed', () => {
    expect(formatMove(parsed(' (+1,-02)>NE '))).toBe('(1,-2)>NE');
  });
});

describe('move records of abalone-wasm', () => {
  test('a move is 8 integers [n, dir, q0, r0, q1, r1, q2, r2], unused coordinates are 0', () => {
    expect(Array.from(toRecord(parsed('(0,0)>SE')))).toEqual([1, 5, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(toRecord(parsed('(-1,2)(0,2)>E')))).toEqual([2, 0, -1, 2, 0, 2, 0, 0]);
    expect(Array.from(toRecord(parsed('(0,4)(0,3)(0,2)>NW')))).toEqual([3, 4, 0, 4, 0, 3, 0, 2]);
  });

  test('more than 3 cells keep their count, so the engine refuses the move', () => {
    expect(Array.from(toRecord(parsed('(0,0)(1,0)(2,0)(3,0)>E')))).toEqual([4, 0, 0, 0, 1, 0, 2, 0]);
  });

  test('reads one record back', () => {
    expect(fromRecord(Int32Array.from([2, 3, -1, 2, 0, 2, 0, 0]))).toEqual({ cells: [[-1, 2], [0, 2]], dir: 3 });
  });

  test('splits back to back records', () => {
    expect(fromRecords(Int32Array.from([1, 0, 4, -4, 0, 0, 0, 0, 3, 2, 0, 4, 0, 3, 0, 2]))).toEqual([
      { cells: [[4, -4]], dir: 0 },
      { cells: [[0, 4], [0, 3], [0, 2]], dir: 2 },
    ]);
    expect(fromRecords(new Int32Array())).toEqual([]);
  });
});
