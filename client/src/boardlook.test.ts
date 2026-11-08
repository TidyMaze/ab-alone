import { describe, expect, it } from 'vitest';
import { BOARD_LOOKS, TERRACE_LOOK, terraceDeckLook, terraceSpaceLook } from './boardlook';
import { BOSS_SPACE } from './bossspace';
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
  it('a boss space on the terrace look takes the arena board and changes its sun, its hemisphere, its sky and the tint of the lit board only (#1551)', () => {
    const space = BOSS_SPACE.alien!;
    const look = terraceSpaceLook(space);
    expect(look).toMatchObject({ sun: space.sun, elevation: space.elevation, azimuth: space.azimuth, exposure: TERRACE_LOOK.exposure, cell: TERRACE_LOOK.cell, edge: null });
    expect(look.tint).not.toBe(TERRACE_LOOK.tint);
    expect(look.sunIntensity).toBeCloseTo(TERRACE_LOOK.sunIntensity * space.intensity);
    expect(look.sky).not.toBe(TERRACE_LOOK.sky);
    expect(look.background).not.toBe(TERRACE_LOOK.background);
  });
  it('the Mess and the Cargo hold have their own surround on the terrace look, leaning to their key as the neon look does, told apart from each other and from the other decks (#1551)', () => {
    const [mess, cargo] = [terraceDeckLook('mess')!, terraceDeckLook('cargo')!];
    for (const look of [mess, cargo]) {
      expect(look).toMatchObject({ sun: TERRACE_LOOK.sun, sunIntensity: TERRACE_LOOK.sunIntensity, exposure: TERRACE_LOOK.exposure, cell: TERRACE_LOOK.cell, edge: null });
      expect(look.background).not.toBe(TERRACE_LOOK.background);
      expect(look.tint).not.toBe(TERRACE_LOOK.tint);
    }
    expect(mess.background).not.toBe(cargo.background);
    expect(mess.tint).not.toBe(cargo.tint);
    const channel = (hex: number, shift: number): number => (hex >> shift) & 0xff;
    expect(channel(mess.background, 16) - channel(cargo.background, 16)).toBeGreaterThanOrEqual(24); // the Mess leans warm, the Cargo hold cold
    expect(channel(cargo.background, 0) - channel(cargo.background, 16)).toBeGreaterThanOrEqual(24);
    expect(terraceDeckLook('mess')).toBe(mess); // one look per deck: the scene wears it once
    for (const other of ['furnace', 'chapel', 'bridge'] as const) expect(terraceDeckLook(other)).toBeNull(); // their bosses have the space
  });
});
