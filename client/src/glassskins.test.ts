import { describe, expect, it } from 'vitest';
import { DEFAULT_GLASS_SKIN, GLASS_SKINS, glassSkinById, nextGlassSkin } from './glassskins';

describe('the pale glass skins (#377)', () => {
  it('lists the ten pale glass skins, Marble first and the default', () => {
    expect(GLASS_SKINS.map((s) => s.name)).toEqual([
      'Marble', 'Terracotta', 'Porcelain', 'Ivory', 'Styrofoam',
      'Veined marble', 'Warm ivory', 'Rock', 'White onyx', 'Plastic',
    ]);
    expect(DEFAULT_GLASS_SKIN).toBe(GLASS_SKINS[0]!.id);
  });

  it('keeps the ids a player stored, each on its ambientCG material', () => {
    expect(GLASS_SKINS.map((s) => [s.id, s.asset])).toEqual([
      ['smoked', 'Marble025'], ['frost', 'GlazedTerracotta003'], ['pearl', 'Porcelain001'], ['bone', 'Ivory002B'],
      ['moon', 'Styrofoam004'], ['kintsugi', 'Marble021'], ['lantern', 'Ivory001A'], ['prism', 'Rock025'],
      ['nebula', 'Onyx015'], ['visor', 'Plastic013A'],
    ]);
  });

  it('gives every skin a unique id, side 2 and valid values', () => {
    expect(new Set(GLASS_SKINS.map((s) => s.id)).size).toBe(GLASS_SKINS.length);
    expect(new Set(GLASS_SKINS.map((s) => s.name)).size).toBe(GLASS_SKINS.length);
    for (const s of GLASS_SKINS) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.side).toBe(2);
      expect(s.asset).toMatch(/^[A-Za-z]+\d{3}[A-Z]?$/);
      for (const c of [s.tint, s.core ?? 0]) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
      expect(Number.isInteger(s.tile) && s.tile >= 1).toBe(true);
    }
  });

  it('finds a skin by id, Marble when the id is unknown or missing', () => {
    expect(glassSkinById('frost').name).toBe('Terracotta');
    expect(glassSkinById('nope')).toBe(GLASS_SKINS[0]);
    expect(glassSkinById(null)).toBe(GLASS_SKINS[0]);
  });

  it('cycles through the skins and back to the first', () => {
    const seen = [DEFAULT_GLASS_SKIN];
    for (let i = 1; i < GLASS_SKINS.length; i++) seen.push(nextGlassSkin(seen.at(-1)!));
    expect(seen).toEqual(GLASS_SKINS.map((s) => s.id));
    expect(nextGlassSkin(seen.at(-1)!)).toBe(DEFAULT_GLASS_SKIN);
  });

  it('gives the warm ivory its own glow colour, the other skins the cyan core', () => {
    expect(glassSkinById('lantern').core).toBeDefined();
    expect(GLASS_SKINS.filter((s) => s.core !== undefined).map((s) => s.id)).toEqual(['lantern']);
  });
});
