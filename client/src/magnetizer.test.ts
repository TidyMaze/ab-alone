import { describe, expect, it } from 'vitest';
import { COUNTER } from './alien';
import { contrastRatio, type RGB } from './contrast';
import { BLINK_MS, blinkAt, drawAnnounce, drawGlyph, parseAnnounce, parseRepulsions, polarityText, REPULSION_STRIDE, repulsionMoves } from './magnetizer';

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

describe('parseAnnounce', () => {
  it('reads the [q, r, sign] of the bridge, null when nothing is announced', () => {
    expect(parseAnnounce([0, -1, -1])).toEqual({ cell: [0, -1], sign: -1 });
    expect(parseAnnounce([])).toBeNull();
  });
});

describe('polarityText', () => {
  it('counts the player turns to the next polarity: turns 3, 6, 9 in P1', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 10].map((plies) => polarityText(0, plies))).toEqual([
      'Polarity in 2 turns', // turn 1
      'Polarity in 2 turns',
      'Polarity next turn', // turn 2: turn 3 is announced
      'Polarity next turn',
      'Polarity in 3 turns', // turn 3 got it at its start
      'Polarity in 3 turns',
      'Polarity next turn', // turn 5
      'Polarity in 3 turns',
    ]);
  });

  it('every 3rd turn in P2 as in P1, every 2nd turn in P3 (#1237)', () => {
    expect(polarityText(1, 4)).toBe('Polarity in 3 turns'); // turn 3
    expect(polarityText(1, 6)).toBe('Polarity in 2 turns'); // turn 4
    expect(polarityText(2, 4)).toBe('Polarity next turn'); // turn 3
    expect(polarityText(2, 7)).toBe('Polarity in 2 turns'); // turn 4
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

describe('drawAnnounce', () => {
  it('draws the coming sign on a near-black diamond with a pale edge, smaller than the glyph', () => {
    const calls: string[] = [];
    const styles: string[] = [];
    const g = {
      clearRect: () => calls.push('clear'),
      beginPath: () => {},
      moveTo: (x: number, y: number) => calls.push(`move ${x} ${y}`),
      lineTo: (x: number, y: number) => calls.push(`line ${x} ${y}`),
      closePath: () => {},
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`bar ${x} ${y} ${w} ${h}`),
      set fillStyle(v: string) {
        styles.push(v);
      },
      set strokeStyle(v: string) {
        styles.push(`edge ${v}`);
      },
      lineWidth: 0,
    };
    drawAnnounce(g as unknown as CanvasRenderingContext2D, 1, 64);
    expect(calls).toEqual(['clear', 'move 32 4', 'line 60 32', 'line 32 60', 'line 4 32', 'fill', 'stroke', 'bar 19 28 26 8', 'bar 28 19 8 26']);
    expect(styles).toEqual(['#0b0d0f', 'edge #d8d4c8', '#d8d4c8']);
    expect(g.lineWidth).toBe(4);
  });
});

describe('blinkAt, the announced marble (#741)', () => {
  it('pulses in opacity about once a second, never fully out', () => {
    expect(BLINK_MS).toBe(1000);
    expect(blinkAt(0, false)).toBeCloseTo(1);
    expect(blinkAt(BLINK_MS / 2, false)).toBeCloseTo(0.3);
    expect(blinkAt(BLINK_MS, false)).toBeCloseTo(1);
  });

  it('stays steady with reduced motion', () => {
    expect(blinkAt(BLINK_MS / 2, true)).toBe(1);
  });
});
