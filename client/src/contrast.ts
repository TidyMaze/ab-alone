// WCAG 2 relative luminance and contrast ratio, the measure of docs/specs/world.md section 5 (cell edge 3:1).
export type RGB = readonly [number, number, number];

/** Relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export function relativeLuminance([r, g, b]: RGB): number {
  const linear = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contrast ratio between two colours, from 1 (none) to 21 (black on white). Order does not matter. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
