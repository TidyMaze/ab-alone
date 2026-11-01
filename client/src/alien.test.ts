import { describe, expect, it, vi } from 'vitest';
import { COUNTER, COUNTER_MAX, drawCounter, drawShell, eggGlow, eggText, parseEggs, shellTint } from './alien';
import { contrastRatio, type RGB } from './contrast';
import { SKINS } from './skins';
import { TONAL, tonalMarble } from './look';

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

describe('parseEggs', () => {
  it('splits the flat [q, r, player turns left] records of the bridge', () => {
    expect(parseEggs([-3, 1, 4, 0, 0, 1])).toEqual([
      { cell: [-3, 1], left: 4 },
      { cell: [0, 0], left: 1 },
    ]);
    expect(parseEggs([])).toEqual([]);
  });

  it('refuses a length that is not a multiple of 3', () => {
    expect(() => parseEggs([4, -1])).toThrow('egg array length 2 is not a multiple of 3');
  });
});

describe('eggText', () => {
  it('is empty without eggs', () => {
    expect(eggText([])).toBe('');
  });

  it('groups the eggs by player turns left, soonest first', () => {
    const eggs = [
      { cell: [0, 0], left: 4 },
      { cell: [1, 0], left: 1 },
      { cell: [2, 0], left: 4 },
    ] as const;
    expect(eggText(eggs.map((e) => ({ cell: [...e.cell] as [number, number], left: e.left })))).toBe(
      'Eggs hatch: 1 in 1 turn · 2 in 4 turns',
    );
  });
});

describe('eggGlow', () => {
  it('pulses once a second between two levels, under the 3 a second flash cap', () => {
    const levels = [0, 0.25, 0.5, 0.75, 1].map((t) => eggGlow(t, false));
    expect(levels[0]).toBeCloseTo(levels[4]!); // one period a second
    expect(levels[2]).toBeGreaterThan(levels[0]! + 0.3); // the peak, half a second in
    expect(Math.min(...levels)).toBeGreaterThan(0); // never off: a steady glow
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
  });

  it('holds still under reduced motion', () => {
    expect(new Set([0, 0.3, 0.5, 0.9].map((t) => eggGlow(t, true))).size).toBe(1);
    expect(eggGlow(0, true)).toBeGreaterThan(0);
  });
});

describe('the counter above an egg', () => {
  it('counts 4 player turns at most', () => {
    expect(COUNTER_MAX).toBe(4);
  });

  it('reads 3:1 and more: the pale digit on its near-black plate', () => {
    expect(contrastRatio(rgb(COUNTER.ink), rgb(COUNTER.plate))).toBeGreaterThanOrEqual(3);
  });

  it('draws the plate, then the digit in the middle', () => {
    const calls: string[] = [];
    const fills: string[] = [];
    const g = {
      clearRect: vi.fn(() => calls.push('clear')),
      beginPath: vi.fn(),
      arc: vi.fn(() => calls.push('arc')),
      fill: vi.fn(() => calls.push('fill')),
      fillText: vi.fn((text: string, x: number, y: number) => calls.push(`text ${text} ${x} ${y}`)),
      set fillStyle(v: string) {
        fills.push(v);
      },
      font: '',
      textAlign: '',
      textBaseline: '',
    };
    drawCounter(g as unknown as CanvasRenderingContext2D, 3, 64);
    expect(calls).toEqual(['clear', 'arc', 'fill', 'text 3 32 32']);
    expect(fills).toEqual(['#0b0d0f', '#d8d4c8']);
    expect(g.textAlign).toBe('center');
    expect(g.textBaseline).toBe('middle');
    expect(g.font).toBe('bold 44px sans-serif');
  });
});

describe('the shell of an egg', () => {
  const recorder = () => {
    const calls: string[] = [];
    const g = {
      clearRect: vi.fn(),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) => calls.push(`rect ${x} ${y} ${w} ${h}`)),
      beginPath: vi.fn(),
      arc: vi.fn(() => calls.push('speck')),
      fill: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(() => calls.push('vein')),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };
    return { g, calls };
  };

  it('paints the Alien colour over the whole map, then speckles and veins in a tint of it', () => {
    const { g, calls } = recorder();
    drawShell(g as unknown as CanvasRenderingContext2D, 0x101010, 128);
    expect(calls[0]).toBe('rect 0 0 128 128');
    expect(calls.filter((c) => c === 'speck').length).toBeGreaterThanOrEqual(30);
    expect(calls.filter((c) => c === 'vein').length).toBeGreaterThanOrEqual(3);
    expect(g.strokeStyle).toBe('#' + shellTint(0x101010).toString(16).padStart(6, '0'));
    expect(g.lineWidth).toBeGreaterThan(0);
  });

  it('is the same shell each time: no random', () => {
    const [a, b] = [recorder(), recorder()];
    drawShell(a.g as unknown as CanvasRenderingContext2D, 0x44363f, 64);
    drawShell(b.g as unknown as CanvasRenderingContext2D, 0x44363f, 64);
    expect(a.g.arc.mock.calls).toEqual(b.g.arc.mock.calls);
  });

  it('shows its marks 3:1 on the Alien colour in every shell skin, the terrace shell and the tonal look', () => {
    const bases = [...SKINS.map((s) => s.color), 0x0a0c0f, tonalMarble(1, 0x000000), TONAL.black.inner, TONAL.black.outer];
    for (const base of bases) expect(contrastRatio(rgb(shellTint(base)), rgb(base))).toBeGreaterThanOrEqual(3);
  });
});
