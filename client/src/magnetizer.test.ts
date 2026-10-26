import { describe, expect, it } from 'vitest';
import { COUNTER } from './alien';
import { contrastRatio, type RGB } from './contrast';
import { drawGlyph, parseRepulsions, polarityText, REPULSION_STRIDE, repulsionMoves } from './magnetizer';

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

describe('parseRepulsions', () => {
  it('splits the 126 integer records of the bridge: the pair, the 61 board codes, the 61 polarities', () => {
    const board = Array.from({ length: 61 }, (_, i) => i % 3);
    const poles = Array.from({ length: 61 }, (_, i) => (i === 5 ? -1 : 0));
    const flat = [0, -1, 0, 0, ...board, ...poles, 1, 0, 2, 0, ...poles, ...board];
    expect(REPULSION_STRIDE).toBe(126);
    expect(parseRepulsions(flat)).toEqual([
      { pair: [[0, -1], [0, 0]], board, poles },
      { pair: [[1, 0], [2, 0]], board: poles, poles: board },
    ]);
    expect(parseRepulsions([])).toEqual([]);
  });

  it('refuses a length that is not a multiple of 126', () => {
    expect(() => parseRepulsions([0, 1])).toThrow('repulsion array length 2 is not a multiple of 126');
  });
});

describe('repulsionMoves', () => {
  it('is the two pushes of a pair: b away from a, a away from b', () => {
    expect(repulsionMoves([[0, -1], [0, 0]])).toEqual([
      { cells: [[0, 0]], dir: 5 },
      { cells: [[0, -1]], dir: 4 },
    ]);
  });
});

describe('polarityText', () => {
  it('counts the player turns to the next polarity in P1', () => {
    expect([0, 1, 2, 3, 4, 5].map((plies) => polarityText(0, plies))).toEqual([
      'Polarity in 2 turns',
      'Polarity in 1 turn',
      'Polarity in 1 turn',
      'Polarity in 2 turns',
      'Polarity in 2 turns',
      'Polarity in 1 turn',
    ]);
  });

  it('says every turn in P2, and all the marbles in P3', () => {
    expect(polarityText(1, 7)).toBe('Polarity every turn');
    expect(polarityText(2, 7)).toBe('All polarities every turn');
  });
});

describe('drawGlyph', () => {
  const draw = (sign: number) => {
    const calls: string[] = [];
    const fills: string[] = [];
    const g = {
      clearRect: () => calls.push('clear'),
      beginPath: () => {},
      arc: () => calls.push('arc'),
      fill: () => calls.push('fill'),
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`bar ${x} ${y} ${w} ${h}`),
      set fillStyle(v: string) {
        fills.push(v);
      },
    };
    drawGlyph(g as unknown as CanvasRenderingContext2D, sign, 64);
    return { calls, fills };
  };

  it('draws a pale bar across a near-black disc for −, and a second bar up for +', () => {
    expect(draw(-1)).toEqual({ calls: ['clear', 'arc', 'fill', 'bar 13 28 38 8'], fills: ['#0b0d0f', '#d8d4c8'] });
    expect(draw(1).calls).toEqual(['clear', 'arc', 'fill', 'bar 13 28 38 8', 'bar 28 13 8 38']);
  });

  it('reads at 3:1 and more, the tell colours of The Alien', () => {
    expect(contrastRatio(rgb(COUNTER.ink), rgb(COUNTER.plate))).toBeGreaterThan(3);
  });
});
