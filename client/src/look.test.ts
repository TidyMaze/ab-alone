import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, GLOW, LOOK_KEY, MARBLE_LOOK, TONAL, flat, loadsTexture, mix, readLook, tonalMarble } from './look';

const memory = (value?: string) => ({ getItem: (k: string) => (k === LOOK_KEY ? (value ?? null) : null), setItem: () => undefined });

describe('the look (#1138)', () => {
  it('follows the palette of the design canvas', () => {
    expect(TONAL).toEqual({
      plate: 0x26282c, cell: 0x32353a, veiled: 0x2a2c30,
      black: { inner: 0x4a4d52, outer: 0x0f1012 }, white: { inner: 0xffffff, outer: 0xdfe3e8 },
      last: 0x8cc8ff, revealed: 0xffb870,
    });
  });

  it('reads the look from the address first, then the stored one, then the default', () => {
    expect(readLook('?look=tonal', memory('pbr'))).toBe('tonal');
    expect(readLook('?look=pbr', memory('tonal'))).toBe('pbr');
    expect(readLook('?look=nope', memory('tonal'))).toBe('tonal');
    expect(readLook('', memory('pbr'))).toBe('pbr');
    expect(readLook('', memory('nope'))).toBe(DEFAULT_LOOK);
    expect(readLook('', null)).toBe(DEFAULT_LOOK);
  });

  it('stores the look an address names, and survives blocked storage', () => {
    const kept: string[] = [];
    readLook('?look=tonal', { getItem: () => null, setItem: (_k, v) => void kept.push(v) });
    expect(kept).toEqual(['tonal']);
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLook('?look=pbr', blocked)).toBe('pbr');
  });

  it('mixes two colours channel by channel', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x102030, 0x102030, 0.3)).toBe(0x102030);
    expect(mix(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mix(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it('gives a marble one flat colour, the middle of its side gradient half way to its skin tone', () => {
    expect(tonalMarble(1, 0x101010)).toBe(mix(mix(TONAL.black.inner, TONAL.black.outer, 0.5), 0x101010, 0.5));
    expect(tonalMarble(2, 0xd6d6d6)).toBeGreaterThan(tonalMarble(1, 0xd6d6d6));
    expect(tonalMarble(1, 0x583a3d)).not.toBe(tonalMarble(1, 0x101010));
  });

  it('loads every texture in pbr, and in tonal only the backdrop and the crack decal', () => {
    for (const name of ['deck-albedo.ktx2', 'pbr/skin-Leather027-albedo.ktx2', 'backdrop.ktx2']) expect(loadsTexture('pbr', name)).toBe(true);
    expect(['backdrop.ktx2', 'crack-decal.ktx2'].map((n) => loadsTexture('tonal', n))).toEqual([true, true]);
    for (const name of ['deck-albedo.ktx2', 'deck-mess.ktx2', 'pbr/skin-Leather027-albedo.ktx2', 'pbr/board-normal.ktx2'])
      expect(loadsTexture('tonal', name)).toBe(false);
  });

  it('lights a flat material by itself as much as it reads its tone under the dim room', () => {
    expect(flat(0x32353a)).toEqual({ color: 0x32353a, emissive: 0x32353a, emissiveIntensity: GLOW });
    expect(GLOW).toBeGreaterThan(0);
    expect(GLOW).toBeLessThanOrEqual(1);
  });

  it('keeps a soft highlight on a marble', () => {
    expect(MARBLE_LOOK).toEqual({ roughness: 0.4, metalness: 0 });
  });
});
