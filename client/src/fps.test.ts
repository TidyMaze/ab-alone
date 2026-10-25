import { describe, expect, it } from 'vitest';
import { FPS_WINDOW, fpsOf, keepWindow } from './fps';

describe('fpsOf (the FPS readout, #426)', () => {
  it('counts the intervals between the first and last stamp, rounded', () => {
    const at60 = Array.from({ length: 31 }, (_, i) => (i * 1000) / 60);
    expect(fpsOf(at60)).toBe(60);
    expect(fpsOf([0, 20, 40, 60, 80])).toBe(50);
  });
  it('reads 0 with fewer than two stamps or no time between them', () => {
    expect(fpsOf([])).toBe(0);
    expect(fpsOf([5])).toBe(0);
    expect(fpsOf([5, 5])).toBe(0);
  });
});

describe('keepWindow', () => {
  it('appends the new stamp and keeps only the last FPS_WINDOW', () => {
    const full = Array.from({ length: FPS_WINDOW }, (_, i) => i);
    const next = keepWindow(full, 99);
    expect(next).toHaveLength(FPS_WINDOW);
    expect(next[0]).toBe(1);
    expect(next.at(-1)).toBe(99);
  });
  it('does not change the array it was given', () => {
    const before = [1, 2];
    keepWindow(before, 3);
    expect(before).toEqual([1, 2]);
  });
});
