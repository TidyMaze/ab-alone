import { describe, expect, it } from 'vitest';
import { landing, parseEchoTell } from './echo';

describe('parseEchoTell', () => {
  it('reads records of 9 of the bridge: the skipped flag, then the move', () => {
    expect(parseEchoTell([0, 1, 5, 0, -2, 0, 0, 0, 0, 1, 2, 4, 1, -1, 2, -1, 0, 0])).toEqual([
      { mv: { cells: [[0, -2]], dir: 5 }, skipped: false },
      { mv: { cells: [[1, -1], [2, -1]], dir: 4 }, skipped: true },
    ]);
    expect(parseEchoTell([])).toEqual([]);
  });
});

describe('landing', () => {
  it('is the cells the moved marbles land on', () => {
    expect(landing({ cells: [[0, -2]], dir: 5 })).toEqual([[0, -1]]);
    expect(landing({ cells: [[1, -1], [2, -1]], dir: 0 })).toEqual([[2, -1], [3, -1]]);
  });
});
