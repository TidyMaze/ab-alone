import { describe, expect, it } from 'vitest';
import { chaplainText, parseCells, previewFlips, type PreviewEngine } from './chaplain';

describe('parseCells', () => {
  it('splits the flat [q, r] lists of the bridge', () => {
    expect(parseCells([0, 1, -2, 3])).toEqual([
      [0, 1],
      [-2, 3],
    ]);
    expect(parseCells([])).toEqual([]);
  });

  it('refuses an odd length', () => {
    expect(() => parseCells([1, 2, 3])).toThrow('cell array length 3 is not even');
  });
});

/** Replays what it is given; `flips` answers for the position after `plays` moves. */
function fake(flipsAfter: number[][], failOn = -1) {
  const played: number[][] = [];
  const make = (): PreviewEngine => {
    let n = 0;
    return {
      play(mv) {
        if (n === failOn) throw new Error('illegal');
        played.push(Array.from(mv));
        n++;
      },
      flips: () => flipsAfter[n] ?? [],
    };
  };
  return { make, played };
}

describe('previewFlips', () => {
  it('replays the history, plays the hovered move and lists the marbles it exposes', () => {
    const { make, played } = fake([[], [], [0, 1]]);
    const history = [[1, 0, 0, 0, 0, 0, 0, 0]];
    const record = [1, 4, 0, 2, 0, 0, 0, 0];
    expect(previewFlips(history, record, make)).toEqual([[0, 1]]);
    expect(played).toEqual([history[0], record]);
  });

  it('is empty without a hovered move or when the engine rejects it', () => {
    expect(previewFlips([], null, fake([]).make)).toEqual([]);
    expect(previewFlips([], [1, 0, 0, 0, 0, 0, 0, 0], fake([[0, 1], [0, 1]], 0).make)).toEqual([]);
  });
});

describe('chaplainText', () => {
  it('says nothing when no marble is exposed or converted', () => {
    expect(chaplainText(0, 0)).toBe('');
  });

  it('counts the exposed and the converted marbles', () => {
    expect(chaplainText(1, 0)).toBe('Flips this turn: 1 marble');
    expect(chaplainText(2, 0)).toBe('Flips this turn: 2 marbles');
    expect(chaplainText(0, 1)).toBe('Converted: 1');
    expect(chaplainText(2, 3)).toBe('Flips this turn: 2 marbles · Converted: 3');
  });
});
