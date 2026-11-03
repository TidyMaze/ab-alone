import { describe, expect, it } from 'vitest';
import { BOARD_LOOKS, TERRACE_LOOK } from './boardlook';
import { SUN, TERRACE_EXPOSURE } from './tablezero';

// The three boards of a lair fight (docs/specs/openworld.md section 11, #1496): data only, scene.ts applies them.
describe('the board looks', () => {
  it('the terrace look is the board as it always was: the arena sun, the hemisphere, the exposure, no tint, no glow', () => {
    expect(TERRACE_LOOK).toMatchObject({ sun: SUN.colour, sunIntensity: SUN.intensity, elevation: SUN.elevation, azimuth: SUN.azimuth, sky: SUN.sky, ground: SUN.ground, hemisphere: SUN.hemisphere, exposure: TERRACE_EXPOSURE, tint: 0xffffff, dome: 0xffffff, cell: 0xffffff, edge: null });
  });

  it('has a look for each phase, and they differ', () => {
    expect(Object.keys(BOARD_LOOKS)).toEqual(['day', 'dusk', 'night']);
    expect(new Set(Object.values(BOARD_LOOKS).map((look) => look.background)).size).toBe(3);
    expect(new Set(Object.values(BOARD_LOOKS).map((look) => look.tint)).size).toBe(3);
  });

  it('day is bright and warm, dusk is low and orange with long shadows, night has a moonlight key and glowing cell edges', () => {
    const { day, dusk, night } = BOARD_LOOKS;
    expect(day.sunIntensity).toBeGreaterThanOrEqual(TERRACE_LOOK.sunIntensity);
    expect(day.edge).toBeNull();
    expect(dusk.elevation).toBeLessThan(TERRACE_LOOK.elevation); // long shadows: lower than the terrace's sun
    expect(dusk.elevation).toBeLessThan(day.elevation);
    expect(dusk.edge).toBeNull();
    expect(night.sunIntensity).toBeGreaterThan(0);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(night.edge).not.toBeNull();
    const red = (hex: number): number => hex >> 16;
    const blue = (hex: number): number => hex & 0xff;
    expect(red(day.sun)).toBeGreaterThan(blue(day.sun)); // warm
    expect(red(dusk.sun)).toBeGreaterThan(blue(dusk.sun));
    expect(blue(night.sun)).toBeGreaterThan(red(night.sun)); // moonlight
  });
});
