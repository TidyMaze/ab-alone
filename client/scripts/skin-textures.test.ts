import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node dependency, no type declarations
import jpeg from 'jpeg-js';
import { GLASS_SKINS } from '../src/glassskins';
import { SKINS } from '../src/skins';

// Every skin loads its maps by name (`pbr/skin-<asset>-<map>.ktx2`, main.ts): a skin without its sources would wear
// the flat colour, and a source no skin names would ship for nothing.
const PBR = new URL('../textures/pbr/', import.meta.url);
const maps = (s: { asset: string; extra: readonly string[] }): string[] =>
  ['albedo', 'normal', 'roughness', ...s.extra].map((kind) => `skin-${s.asset}-${kind}.jpg`);

describe('the skin textures', () => {
  const wanted = [...SKINS, ...GLASS_SKINS].flatMap(maps);

  it('has the sources of every skin under textures/pbr/', () => {
    expect(wanted).toHaveLength(67); // 20 skins x 3 maps, 2 emission, 3 metalness, 2 ambient occlusion
    expect(wanted.filter((file) => !existsSync(new URL(file, PBR)))).toEqual([]);
  });

  it('holds no skin source that no skin uses', () => {
    const present = readdirSync(PBR).filter((file) => file.startsWith('skin-'));
    expect(present.filter((file) => !wanted.includes(file))).toEqual([]);
  });
});

// The mean colour of a shell skin, its albedo's mean in linear light, back to sRGB: what skins.ts `color` says, so the
// accent contrast tests measure the shell as it is drawn.
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (l: number): number => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
const meanColor = (asset: string): number[] => {
  const { data } = jpeg.decode(readFileSync(new URL(`skin-${asset}-albedo.jpg`, PBR)), { useTArray: true }) as { data: Uint8Array };
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += linear(data[i + k]! / 255);
  return sum.map((s) => srgb(s / (data.length / 4)));
};

describe('the shell skins colour', () => {
  it.each(SKINS.map((s) => [s.id, s] as const))('%s is the mean of its albedo, 3 steps of 255 at most', (_id, s) => {
    const expected = meanColor(s.asset);
    const actual = [s.color >> 16, (s.color >> 8) & 255, s.color & 255];
    actual.forEach((v, k) => expect(Math.abs(v - expected[k]!), `${s.id} channel ${k} is ${expected[k]}`).toBeLessThanOrEqual(3));
  });
});

// The same for the white skins: their `color` is the one tone the tonal look (look.ts) draws them in (#1138).
describe('the white skins colour', () => {
  it.each(GLASS_SKINS.map((s) => [s.id, s] as const))('%s is the mean of its albedo, 3 steps of 255 at most', (_id, s) => {
    const expected = meanColor(s.asset);
    const actual = [s.color >> 16, (s.color >> 8) & 255, s.color & 255];
    actual.forEach((v, k) => expect(Math.abs(v - expected[k]!), `${s.id} channel ${k} is ${expected[k]}`).toBeLessThanOrEqual(3));
  });
});
