// The readability targets of the neon Open world (#1656, the art director's brief and pair rule), on the palette's source hex values:
// WCAG relative luminance and contrast, the HSV hue, and the CIE76 dE of the colours seen with protanopia and deuteranopia (Machado
// 2009, severity 1, in linear RGB). The lit scene is measured on the captures; these keep the palette from slipping back.
import { describe, expect, it } from 'vitest';
import { NEON } from './neonlook';
import { BIOMES, type Biome } from './openworld';
import { MAP_LIFT, NEON_BIOME, WORLD, mapColour } from './neonworld';
import { NEON_GRID } from './openworldedge';

const channels = (hex: number): number[] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => c / 255);
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminanceOf = ([r, g, b]: number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
const luminance = (hex: number): number => luminanceOf(channels(hex).map(linear));
const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const ratio = (a: number, b: number): number => contrast(luminance(a), luminance(b));
const hue = (hex: number): number => {
  const [r, g, b] = channels(hex) as [number, number, number];
  const [hi, lo] = [Math.max(r, g, b), Math.min(r, g, b)];
  const d = hi - lo;
  if (d === 0) return 0;
  const sector = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (sector * 60 + 360) % 360;
};
const hueGap = (a: number, b: number): number => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};
const MACHADO = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
} as const;
const lab = ([r, g, b]: number[]): number[] => {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
  const y = f(luminanceOf([r!, g!, b!]));
  const z = f((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const seen = (hex: number, deficiency: keyof typeof MACHADO): number[] => {
  const rgb = channels(hex).map(linear);
  return lab(MACHADO[deficiency].map((row) => Math.min(1, Math.max(0, row.reduce((sum, m, i) => sum + m * rgb[i]!, 0)))));
};
/** The smaller of the two colour-blind dE of a pair: protanopia and deuteranopia. */
const blindDE = (a: number, b: number): number => Math.min(...(['protanopia', 'deuteranopia'] as const).map((k) => Math.hypot(...seen(a, k).map((v, i) => v - seen(b, k)[i]!))));

const grounds = (): [string, number][] => [...BIOMES.map((b): [string, number] => [b, NEON_BIOME[b].ground]), ['sand', WORLD.sand], ['rock', WORLD.rock]];
const pairs = <T>(items: readonly T[]): [T, T][] => items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]));

describe('the neon Open world palette against the readability targets (#1656)', () => {
  it('measures what check.py measures: WCAG contrast, the hue and the colour-blind dE', () => {
    expect(ratio(0xffffff, 0x000000)).toBeCloseTo(21, 5);
    expect([hue(0xff0000), hue(0x00ff00), hue(0x0000ff), hue(0xff00ff), hue(0x808080)]).toEqual([0, 120, 240, 300, 0]);
    expect(hueGap(0xff0000, 0xff00ff)).toBe(60); // round the circle, not across it
    expect(blindDE(0xff0000, 0x00ff00)).toBeLessThan(blindDE(0xff0000, 0x0000ff)); // red and green merge for these players, red and blue do not
    expect(blindDE(0x123456, 0x123456)).toBe(0);
  });

  it('puts every land ground at least 1.6:1 over the deep water, the rock 1.4:1, and the shallows darker than all of them', () => {
    // the rock and the peaks read by their height and their ridge line and seldom meet the water: 1.4:1 is their own target (art director, #1656)
    for (const [name, ground] of grounds()) {
      expect(ratio(ground, WORLD.deep), name).toBeGreaterThanOrEqual(name === 'rock' ? 1.4 : 1.6);
      expect(luminance(WORLD.shallow), name).toBeLessThan(luminance(ground));
    }
  });

  it('draws the foam line on the coast at least 3:1 over the deep water', () => {
    expect(ratio(WORLD.foam, WORLD.deep)).toBeGreaterThanOrEqual(3);
  });

  it('tells every two biomes, and the rock, apart: 1.25:1 of luminance, or a colour-blind dE of 15 with 30 degrees of hue', () => {
    const named: [string, number][] = [...BIOMES.map((b): [string, number] => [b, NEON_BIOME[b].ground]), ['rock', WORLD.rock]];
    for (const [[a, x], [b, y]] of pairs(named)) expect(ratio(x, y) >= 1.25 || (blindDE(x, y) >= 15 && hueGap(x, y) >= 30), `${a}/${b}`).toBe(true);
  });

  it('keeps the desert, the badlands and the archipelago apart by luminance alone (the strict pairs of the rule)', () => {
    const strict: [Biome, Biome][] = [['desert', 'badlands'], ['badlands', 'archipelago'], ['desert', 'archipelago']];
    for (const [a, b] of strict) expect(ratio(NEON_BIOME[a].ground, NEON_BIOME[b].ground), `${a}/${b}`).toBeGreaterThanOrEqual(1.25);
  });

  it('keeps the hero and the troop at least 4.5:1 on every ground and on the water', () => {
    for (const marble of [NEON.whiteMarble, WORLD.troop])
      for (const [name, ground] of [...grounds(), ['shallow', WORLD.shallow], ['deep', WORLD.deep]] as [string, number][]) expect(ratio(marble, ground), name).toBeGreaterThanOrEqual(4.5);
  });

  it('gives each biome its own accent, at least 3:1 over its ground, in place of the white', () => {
    for (const biome of BIOMES) expect(ratio(NEON_BIOME[biome].prop, NEON_BIOME[biome].ground), biome).toBeGreaterThanOrEqual(3);
    expect(new Set(BIOMES.map((b) => NEON_BIOME[b].prop)).size).toBe(BIOMES.length);
  });

  it('draws each trace as its own ground x1.2 at most (openworldedge.ts): at most 1.2:1 over it', () => {
    expect(NEON_GRID.trace).toBeGreaterThan(0);
    for (const [name, ground] of grounds()) {
      const lit = luminanceOf(channels(ground).map((c) => linear(c) * (1 + NEON_GRID.trace)));
      expect(contrast(lit, luminance(ground)), name).toBeLessThanOrEqual(1.2);
    }
  });

  it('lifts the grounds and the water for the map without clipping a channel, so each keeps its hue', () => {
    for (const [name, colour] of [...grounds(), ['shallow', WORLD.shallow]] as [string, number][]) {
      const lifted = mapColour(colour);
      expect(Math.abs(hue(lifted) - hue(colour)), name).toBeLessThan(1.5);
      expect(luminance(lifted), name).toBeGreaterThan(luminance(colour));
    }
    expect(luminance(mapColour(WORLD.rock))).toBeGreaterThan(luminance(WORLD.rock) * (MAP_LIFT - 1)); // the darkest land still takes the full lift
  });
});
