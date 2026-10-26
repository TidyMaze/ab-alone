import { describe, expect, it } from 'vitest';
import { CORE, GLASS, SEATS, SHELL } from './marbles';

// Relative luminance and contrast ratio (WCAG 2), on 0xrrggbb colours.
const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => v / 255);
const linear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: number[]): number => 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
// The three common colour-blind simulations (Machado et al. 2009, severity 1), on sRGB channels.
const SIMULATIONS: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (m: number[][], c: number[]): number[] =>
  m.map((row) => Math.min(1, Math.max(0, row.reduce((s, k, i) => s + k * c[i]!, 0))));

// docs/specs/world.md section 5: the player is smoked glass with a cyan core, the enemy a matte ridged shell, no core.
describe('marble looks, world.md section 5', () => {
  it('the core is the cold cyan of the palette, small inside the 0.36 marble', () => {
    expect(CORE.color).toBe(0x7fd6e8);
    expect(CORE.radius).toBeGreaterThan(0);
    expect(CORE.radius).toBeLessThan(0.36 / 2);
  });

  it('the glass is see-through and smoked: darker than the pale bone-white it was', () => {
    expect(GLASS.transparent).toBe(true);
    expect(GLASS.opacity).toBeGreaterThan(0);
    expect(GLASS.opacity).toBeLessThan(1);
    expect(luminance(channels(GLASS.color))).toBeLessThan(luminance(channels(0xd8d4c8)) / 4);
  });

  it('the shell is matte and ridged, nothing emissive, no core', () => {
    expect(SHELL.roughness).toBeGreaterThanOrEqual(0.5);
    expect(SHELL.ridges).toBeGreaterThan(0);
    expect(SHELL).not.toHaveProperty('emissive');
    expect(SHELL).not.toHaveProperty('core');
  });

  it('the core stands out from the shell at 3:1 in greyscale (#26)', () => {
    expect(contrast(channels(CORE.color), channels(SHELL.color))).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.keys(SIMULATIONS))('the core stands out from the shell at 3:1 under %s simulation (#26)', (name) => {
    const m = SIMULATIONS[name]!;
    expect(contrast(simulate(m, channels(CORE.color)), simulate(m, channels(SHELL.color)))).toBeGreaterThanOrEqual(3);
  });
});

// Battle royale (#49, #501): one shell tint per seat, world.md section 5. A glyph tells the seats apart too, never the
// colour alone, but the tints stay apart and readable on the deck for every colour vision.
describe('battle royale seat tints', () => {
  const deck = channels(0x0b0d0f);
  const views: Record<string, (c: number[]) => number[]> = {
    normal: (c) => c,
    ...Object.fromEntries(Object.entries(SIMULATIONS).map(([name, m]) => [name, (c: number[]) => simulate(m, c)])),
  };

  it('has six distinct tints', () => {
    expect(SEATS).toHaveLength(6);
    expect(new Set(SEATS).size).toBe(6);
  });

  it.each(Object.keys(views))('every tint stands out from the deck at 3:1 in %s vision', (name) => {
    for (const seat of SEATS) {
      expect(contrast(views[name]!(channels(seat)), deck), seat.toString(16)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.keys(views))('no two tints look alike in %s vision', (name) => {
    const seen = SEATS.map((seat) => views[name]!(channels(seat)));
    seen.forEach((a, i) =>
      seen.slice(i + 1).forEach((b) => expect(Math.hypot(...a.map((v, k) => v - b[k]!))).toBeGreaterThanOrEqual(0.15)),
    );
  });
});
