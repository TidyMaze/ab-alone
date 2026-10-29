import { describe, expect, it } from 'vitest';
import { DEFAULT_SKIN, SKINS, nextSkin, skinById } from './skins';

describe('the shell skins (#377)', () => {
  it('lists the ten dark shells, Leather first and the default', () => {
    expect(SKINS.map((s) => s.name)).toEqual([
      'Leather', 'Black porcelain', 'Lava', 'Fabric', 'Rubber',
      'Steel', 'Painted steel', 'Lava veins', 'Black onyx', 'Terrazzo',
    ]);
    expect(DEFAULT_SKIN).toBe(SKINS[0]!.id);
  });

  it('keeps the ids a player stored, each on its ambientCG material', () => {
    expect(SKINS.map((s) => [s.id, s.asset])).toEqual([
      ['scarab', 'Leather027'], ['obsidian', 'Porcelain003'], ['slag', 'Lava002'], ['hex', 'Fabric004'], ['ash', 'Rubber001'],
      ['riveted', 'Metal027'], ['tar', 'Metal028'], ['ember', 'Lava001'], ['copper', 'Onyx013'], ['void', 'Terrazzo015'],
    ]);
  });

  it('gives every skin a unique id, side 1 and valid material values', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    expect(new Set(SKINS.map((s) => s.name)).size).toBe(SKINS.length);
    for (const s of SKINS) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.side).toBe(1);
      expect(s.asset).toMatch(/^[A-Za-z]+\d{3}[A-Z]?$/);
      for (const c of [s.tint, s.color]) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
      expect(s.metalness >= 0 && s.metalness <= 1).toBe(true);
      expect(Number.isInteger(s.tile) && s.tile >= 1).toBe(true);
      if (s.glow !== undefined) expect(s.glow > 0 && s.glow <= 1).toBe(true);
    }
  });

  it('lights only the two lavas, through their emission map', () => {
    expect(SKINS.filter((s) => s.glow !== undefined).map((s) => s.asset)).toEqual(['Lava002', 'Lava001']);
  });

  it('finds a skin by id, Leather when the id is unknown', () => {
    expect(skinById('hex').name).toBe('Fabric');
    expect(skinById('nope')).toBe(SKINS[0]);
    expect(skinById(null)).toBe(SKINS[0]);
  });

  it('cycles through the skins and back to the first', () => {
    const seen = [DEFAULT_SKIN];
    for (let i = 1; i < SKINS.length; i++) seen.push(nextSkin(seen.at(-1)!));
    expect(seen).toEqual(SKINS.map((s) => s.id));
    expect(nextSkin(seen.at(-1)!)).toBe(DEFAULT_SKIN);
  });
});
