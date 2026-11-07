import { describe, expect, it } from 'vitest';
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

  it('gives every palette an inline pair on the dark theme and the light theme keeps the default colours (#923)', () => {
    for (const id of PALETTES) {
      const pal = paletteById(id);
      expect(themeColors(pal, false)).toEqual({ accent: pal.accent, hazard: pal.hazard });
      const light = themeColors(pal, true);
      if (id === 'default') {
        expect(light).toEqual({ accent: null, hazard: null }); // ui.css's #0a5f73 and #8f4a0c win
        continue;
      }
    }
  });
});
