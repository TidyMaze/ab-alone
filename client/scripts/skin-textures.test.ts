import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node dependency, no type declarations
import jpeg from 'jpeg-js';
import { GLASS_SKINS } from '../src/glassskins';
import { SKINS } from '../src/skins';

// Every skin loads its maps by name (`pbr/skin-<asset>-<map>.ktx2`, main.ts): a skin without its sources would wear the
// flat tint, and a source no skin names would ship for nothing.
const PBR = new URL('../textures/pbr/', import.meta.url);
const maps = (asset: string, glow: boolean): string[] =>
  ['albedo', 'normal', 'roughness', ...(glow ? ['emission'] : [])].map((kind) => `skin-${asset}-${kind}.jpg`);

describe('the skin textures', () => {
  const wanted = [
    ...SKINS.flatMap((s) => maps(s.asset, s.glow !== undefined)),
    ...GLASS_SKINS.flatMap((s) => maps(s.asset, false)),
  ];

  it('has the sources of every skin under textures/pbr/', () => {
    expect(wanted).toHaveLength(62);
    expect(wanted.filter((file) => !existsSync(new URL(file, PBR)))).toEqual([]);
  });

  it('holds no skin source that no skin uses', () => {
    const present = readdirSync(PBR).filter((file) => file.startsWith('skin-'));
    expect(present.filter((file) => !wanted.includes(file))).toEqual([]);
  });
});

// The mean colour of a shell skin, its albedo's mean in linear light times its tint, back to sRGB: what skins.ts `color`
// says, so the accent and mark contrast tests measure the shell as it is drawn.
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (l: number): number => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
const meanColor = (asset: string, tint: number): number[] => {
  const { data } = jpeg.decode(readFileSync(new URL(`skin-${asset}-albedo.jpg`, PBR)), { useTArray: true }) as { data: Uint8Array };
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += linear(data[i + k]! / 255);
  return sum.map((s, k) => srgb((s / (data.length / 4)) * linear(((tint >> (16 - 8 * k)) & 255) / 255)));
};

describe('the shell skins colour', () => {
  it.each(SKINS.map((s) => [s.id, s] as const))('%s is the mean of its albedo times its tint, 3 steps of 255 at most', (_id, s) => {
    const expected = meanColor(s.asset, s.tint);
    const actual = [s.color >> 16, (s.color >> 8) & 255, s.color & 255];
    actual.forEach((v, k) => expect(Math.abs(v - expected[k]!), `${s.id} channel ${k} is ${expected[k]}`).toBeLessThanOrEqual(3));
  });
});
