import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  hexToRgb,
  nextPalette,
  paletteById,
  PALETTES,
  PALETTE_NAMES,
  simulateCvd,
  themeColors,
  type Palette,
} from './palettes';

describe('palettes', () => {
  it('lists the five palettes: default, protan, deutan, tritan, and contrast', () => {
    expect(PALETTES).toEqual(['default', 'protan', 'deutan', 'tritan', 'contrast']);
    expect(PALETTES.map((p) => PALETTE_NAMES[p])).toEqual([
      'Default',
      'Protan',
      'Deutan',
      'Tritan',
      'High contrast',
    ]);
  });

  it('cycles through palettes in order and wraps back to default', () => {
    expect(nextPalette('default')).toBe('protan');
    expect(nextPalette('protan')).toBe('deutan');
    expect(nextPalette('deutan')).toBe('tritan');
    expect(nextPalette('tritan')).toBe('contrast');
    expect(nextPalette('contrast')).toBe('default');
  });

  it('looks up palettes by id, defaulting to default on unknown id', () => {
    expect(paletteById('protan').id).toBe('protan');
    expect(paletteById('unknown' as Palette).id).toBe('default');
  });

  it('provides complete colour definitions for every palette', () => {
    for (const id of PALETTES) {
      const p = paletteById(id);
      expect(p.name).toBeTruthy();
      expect(typeof p.shell).toBe('number');
      expect(typeof p.glass).toBe('number');
      expect(typeof p.core).toBe('number');
      expect(typeof p.rim).toBe('number');
      expect(typeof p.sodium).toBe('number');
      expect(typeof p.tell).toBe('number');
      expect(p.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.hazard).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('converts hex numbers to RGB triples', () => {
    expect(hexToRgb(0x000000)).toEqual([0, 0, 0]);
    expect(hexToRgb(0xffffff)).toEqual([255, 255, 255]);
    expect(hexToRgb(0x7fd6e8)).toEqual([127, 214, 232]);
  });

  it('simulates color vision deficiencies (protan, deutan, tritan)', () => {
    const red = hexToRgb(0xff0000);
    const protanRed = simulateCvd(red, 'protan');
    expect(protanRed[0]).toBeLessThan(255);
    expect(protanRed[1]).toBeGreaterThan(0);

    const green = hexToRgb(0x00ff00);
    const deutanGreen = simulateCvd(green, 'deutan');
    expect(deutanGreen[0]).toBeGreaterThan(0);

    const blue = hexToRgb(0x0000ff);
    const tritanBlue = simulateCvd(blue, 'tritan');
    expect(tritanBlue[1]).toBeGreaterThan(0);
  });

  it('reaches 3:1 contrast ratio between side colours, tells, and against the deck under deficiency simulation', () => {
    const deck = hexToRgb(0x0b0d0f); // dark deck background
    const steel = hexToRgb(0x4a5258); // cell steel surface

    for (const id of PALETTES) {
      const p = paletteById(id);
      const cvdType = id === 'protan' || id === 'deutan' || id === 'tritan' ? id : null;

      const sim = (hex: number) => {
        const rgb = hexToRgb(hex);
        return cvdType ? simulateCvd(rgb, cvdType) : rgb;
      };

      const shellRgb = sim(p.shell);
      const coreRgb = sim(p.core);
      const tellRgb = sim(p.tell);
      const rimRgb = sim(p.rim);

      // Shell (dark side) vs Core (pale glass inner light / accent): >= 3:1
      expect(contrastRatio(shellRgb, coreRgb), `${id}: shell vs core contrast`).toBeGreaterThanOrEqual(3.0);

      // Tell marks (bone/glyphs) vs Shell: >= 3:1
      expect(contrastRatio(shellRgb, tellRgb), `${id}: shell vs tell contrast`).toBeGreaterThanOrEqual(3.0);

      // Core / Rim accent vs Deck: >= 3:1
      expect(contrastRatio(deck, coreRgb), `${id}: core vs deck contrast`).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(deck, rimRgb), `${id}: rim vs deck contrast`).toBeGreaterThanOrEqual(3.0);

      // Tell vs Deck: >= 3:1
      expect(contrastRatio(deck, tellRgb), `${id}: tell vs deck contrast`).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('gives every palette an inline pair on the dark theme and an on-cream pair of 4.5:1 or more on the light one (#923)', () => {
    const cream = [hexToRgb(0xe6e2d6), hexToRgb(0xf3f0e6)];
    for (const id of PALETTES) {
      const pal = paletteById(id);
      expect(themeColors(pal, false)).toEqual({ accent: pal.accent, hazard: pal.hazard });
      const light = themeColors(pal, true);
      if (id === 'default') {
        expect(light).toEqual({ accent: null, hazard: null }); // ui.css's #0a5f73 and #8f4a0c win
        continue;
      }
      for (const hex of [light.accent!, light.hazard!]) {
        for (const bg of cream) expect(contrastRatio(hexToRgb(parseInt(hex.slice(1), 16)), bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
