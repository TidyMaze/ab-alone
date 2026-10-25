import { describe, expect, it } from 'vitest';
import { nextUiScale, UI_SCALES, uiScaleFactor } from './uiscale';

describe('UI scale steps (#382)', () => {
  it('goes 100, 125, 150, 175, 200 %, then back to 100', () => {
    expect(UI_SCALES).toEqual([100, 125, 150, 175, 200]);
    expect(nextUiScale(100)).toBe(125);
    expect(nextUiScale(150)).toBe(175);
    expect(nextUiScale(175)).toBe(200);
    expect(nextUiScale(200)).toBe(100);
  });

  it('gives the --ui-scale factor of a step: 100 % is 1, 200 % is 2', () => {
    expect(uiScaleFactor(100)).toBe('1');
    expect(uiScaleFactor(125)).toBe('1.25');
    expect(uiScaleFactor(200)).toBe('2');
  });
});
