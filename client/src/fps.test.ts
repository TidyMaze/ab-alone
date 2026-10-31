import { describe, expect, it } from 'vitest';
import { FPS_IDLE_MS, FPS_WINDOW, fpsAt, fpsLabel, fpsOf, keepWindow, stampDrawn } from './fps';

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

describe('the readout of the drawn frames (#1064)', () => {
  it('stamps in place, keeps the last FPS_WINDOW, and starts over after an idle gap', () => {
    const stamps: number[] = [];
    for (let i = 0; i < FPS_WINDOW + 5; i++) stampDrawn(stamps, i * 20);
    expect(stamps).toHaveLength(FPS_WINDOW);
    expect(stamps[0]).toBe(5 * 20);
    expect(fpsOf(stamps)).toBe(50);
    stampDrawn(stamps, (FPS_WINDOW + 4) * 20 + FPS_IDLE_MS + 1);
    expect(stamps).toHaveLength(1);
    stampDrawn(stamps, (FPS_WINDOW + 4) * 20 + FPS_IDLE_MS + 21);
    expect(fpsOf(stamps)).toBe(50);
  });

  it('reads 0 for a scene that draws nothing, not the rate of its last frames', () => {
    const stamps = [0, 20, 40];
    expect(fpsAt(stamps, 40 + FPS_IDLE_MS)).toBe(50);
    expect(fpsAt(stamps, 40 + FPS_IDLE_MS + 1)).toBe(0);
    expect(fpsAt([], 0)).toBe(0);
  });

  it('labels the rate, and idle for 0', () => {
    expect(fpsLabel(60)).toBe('60 FPS');
    expect(fpsLabel(0)).toBe('idle');
  });
});
