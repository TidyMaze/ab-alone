import { describe, expect, it } from 'vitest';
import { clampUiScale, maxUiScale, nextUiScale, UI_SCALES, uiScaleFactor } from './uiscale';

describe('UI scale steps (#382)', () => {
  it('has the steps 100, 125, 150, 175, 200 %', () => {
    expect(UI_SCALES).toEqual([100, 125, 150, 175, 200]);
  });

  it('goes up one step at a time, up to the cap, then back to 100', () => {
    expect(nextUiScale(100, 200)).toBe(125);
    expect(nextUiScale(150, 200)).toBe(175);
    expect(nextUiScale(175, 200)).toBe(200);
    expect(nextUiScale(200, 200)).toBe(100);
  });

  it('never offers a step above the cap', () => {
    expect(nextUiScale(100, 100)).toBe(100);
    expect(nextUiScale(125, 150)).toBe(150);
    expect(nextUiScale(150, 150)).toBe(100);
  });

  it('gives the --ui-scale factor of a step: 100 % is 1, 200 % is 2', () => {
    expect(uiScaleFactor(100)).toBe('1');
    expect(uiScaleFactor(125)).toBe('1.25');
    expect(uiScaleFactor(200)).toBe('2');
  });
});

describe('maxUiScale: the largest step a window has room for', () => {
  it('allows 200 % from a 1600 by 900 window up, the large desktop', () => {
    expect(maxUiScale(1600, 900)).toBe(200);
    expect(maxUiScale(1920, 1080)).toBe(200);
  });

  it('allows only 100 % below it: phones, tablets and small windows', () => {
    for (const [w, h] of [
      [375, 812],
      [812, 375],
      [1280, 720],
      [1024, 768],
      [1000, 720],
      [1024, 600],
      [1599, 1080],
      [1920, 899],
    ] as const) {
      expect(maxUiScale(w, h)).toBe(100);
    }
  });

  it('applies a stored step above the cap at the cap', () => {
    expect(clampUiScale(200, 100)).toBe(100);
    expect(clampUiScale(150, 200)).toBe(150);
  });
});
