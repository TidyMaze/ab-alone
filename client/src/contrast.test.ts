import { describe, expect, test } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

// WCAG 2 contrast, the measure of the cell edge and the marbles against the surface (docs/specs/world.md section 5).
describe('contrast', () => {
  test('black and white are 21:1', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
  });

  test('a colour against itself is 1:1, and the order does not matter', () => {
    expect(contrastRatio([120, 40, 10], [120, 40, 10])).toBeCloseTo(1, 6);
    expect(contrastRatio([200, 200, 200], [20, 20, 20])).toBeCloseTo(contrastRatio([20, 20, 20], [200, 200, 200]), 9);
  });

  test('the linear segment below 0.03928 uses the /12.92 branch', () => {
    // 10/255 is below the knee: 10/255 / 12.92 after linearising.
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 9);
  });

  test('cell edge bevel and marks preserve >= 3:1 contrast against shadowed deck (#459)', () => {
    // Bevel has emissive 0x25292d and steel highlight 0xc4cacf
    const bevelRgb: [number, number, number] = [0xc4, 0xca, 0xcf];
    // Under shadow, deck steel (0x4a5258) receives ambient fill (~0.25)
    const shadowDeckRgb: [number, number, number] = [
      Math.round(0x4a * 0.25),
      Math.round(0x52 * 0.25),
      Math.round(0x58 * 0.25),
    ];
    expect(contrastRatio(bevelRgb, shadowDeckRgb)).toBeGreaterThanOrEqual(3.0);
  });
});
