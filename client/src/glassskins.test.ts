import { describe, expect, it } from 'vitest';
import { GLASS } from './marbles';
import { DEFAULT_GLASS_SKIN, GLASS_SKINS, glassSkinById, nextGlassSkin } from './glassskins';
import { PATTERNS, drawSkin } from './skinart';

describe('the pale glass skins (#377)', () => {
  it('lists the ten pale glass skins, Smoked glass first and the default', () => {
    expect(GLASS_SKINS.map((s) => s.name)).toEqual([
      'Smoked glass', 'Frost', 'Pearl', 'Bone ivory', 'Hollow moon',
      'Kintsugi porcelain', 'Lantern core', 'Ice prism', 'Nebula', 'Helmet visor',
    ]);
    expect(DEFAULT_GLASS_SKIN).toBe(GLASS_SKINS[0]!.id);
  });

  it('keeps the current glass as Smoked glass, values unchanged (#291)', () => {
    expect(GLASS_SKINS[0]).toMatchObject({ id: 'smoked', side: 2, color: GLASS.color, roughness: GLASS.roughness, pattern: null });
  });

  it('gives every skin a unique id, side 2, valid colours and roughness, and a known pattern or none', () => {
    expect(new Set(GLASS_SKINS.map((s) => s.id)).size).toBe(GLASS_SKINS.length);
    for (const s of GLASS_SKINS) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.side).toBe(2);
      for (const c of [s.color, s.ink, s.accent, s.core ?? 0]) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
      expect(s.roughness >= 0 && s.roughness <= 1).toBe(true);
      expect(s.pattern === null || s.pattern in PATTERNS).toBe(true);
    }
  });

  it('finds a skin by id, Smoked glass when the id is unknown or missing', () => {
    expect(glassSkinById('frost').name).toBe('Frost');
    expect(glassSkinById('nope')).toBe(GLASS_SKINS[0]);
    expect(glassSkinById(null)).toBe(GLASS_SKINS[0]);
  });

  it('cycles through the skins and back to the first', () => {
    const seen = [DEFAULT_GLASS_SKIN];
    for (let i = 1; i < GLASS_SKINS.length; i++) seen.push(nextGlassSkin(seen.at(-1)!));
    expect(seen).toEqual(GLASS_SKINS.map((s) => s.id));
    expect(nextGlassSkin(seen.at(-1)!)).toBe(DEFAULT_GLASS_SKIN);
  });

  it('gives the Lantern core its own glow colour, the other skins the cyan core', () => {
    expect(glassSkinById('lantern').core).toBeDefined();
    expect(GLASS_SKINS.filter((s) => s.core !== undefined).map((s) => s.id)).toEqual(['lantern']);
  });
});

// A recording 2D context: every method is a spy, the colours and widths are plain fields.
const fakeContext = () => {
  const calls: string[] = [];
  const g = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 0 } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k); void a; }),
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
};

describe('drawSkin on the glass skins', () => {
  it('paints the base colour and, for every skin with a pattern, the pattern on top', () => {
    for (const s of GLASS_SKINS) {
      const { g, calls } = fakeContext();
      drawSkin(g, 256, 128, s);
      expect(calls[0]).toBe('fillRect');
      expect(calls.length > 1).toBe(s.pattern !== null);
    }
  });
});
