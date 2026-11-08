// The three boards of a lair fight (docs/specs/openworld.md section 11, #1496): the hexagonal board dressed for the hour the hero entered the
// lair at. Data only: scene.ts `setBoardLook` applies one to the terrace; a fight outside the Open world keeps `TERRACE_LOOK`, the board as it was.
import type { Phase } from './daynight';
import { SUN, TERRACE_EXPOSURE } from './tablezero';
import type { BossSpace } from './bossspace';
import { mixHex } from './daynight';

export interface BoardLook {
  /** The sun by day, the moon by night: colour, strength and place (degrees over the horizon, and round the board). */
  sun: number;
  sunIntensity: number;
  elevation: number;
  azimuth: number;
  /** The hemisphere: the sky side, the ground side and the strength. */
  sky: number;
  ground: number;
  hemisphere: number;
  /** The colour beyond the board, and the exposure of the picture. */
  background: number;
  exposure: number;
  /** What the lit board (cells, rim, plinth) and the sky dome of the arena file are multiplied by. */
  tint: number;
  dome: number;
  /** What the cell tops are multiplied by on top of the tint: the marbles read 3:1 on them (the contrast of the game), whatever the light. */
  cell: number;
  /** The glow of the cell edges, none by day. */
  edge: number | null;
}

/** The terrace as it always was: the board of every fight outside the Open world, and what a lair fight gives back. */
export const TERRACE_LOOK: BoardLook = {
  sun: SUN.colour,
  sunIntensity: SUN.intensity,
  elevation: SUN.elevation,
  azimuth: SUN.azimuth,
  sky: SUN.sky,
  ground: SUN.ground,
  hemisphere: SUN.hemisphere,
  background: 0x2c3438,
  exposure: TERRACE_EXPOSURE,
  tint: 0xffffff,
  dome: 0xffffff,
  cell: 0xffffff,
  edge: null,
};

/** Day: bright, warm ground. Dusk: orange and violet light from low, long shadows. Night: a dark blue ground, a moonlight key, glowing cell edges. */
export const BOARD_LOOKS: Readonly<Record<Phase, BoardLook>> = {
  day: { sun: 0xffe0b0, sunIntensity: 11, elevation: 34, azimuth: 25, sky: 0xb4ccea, ground: 0x9a8466, hemisphere: 1.7, background: 0x6f93b8, exposure: 0.85, tint: 0xfff5e0, dome: 0xffffff, cell: 0xa4a4a4, edge: null },
  dusk: { sun: 0xffd0a0, sunIntensity: 12, elevation: 18, azimuth: 35, sky: 0xb8a0e8, ground: 0x805868, hemisphere: 1.8, background: 0x3a2a4a, exposure: 1.3, tint: 0xd8d0e8, dome: 0xd0a090, cell: 0xffffff, edge: null },
  night: { sun: 0xe8f0ff, sunIntensity: 6, elevation: 40, azimuth: -35, sky: 0x7f90d0, ground: 0x2a3250, hemisphere: 1.2, background: 0x070a16, exposure: 1.5, tint: 0xa8b8e8, dome: 0x303a60, cell: 0xcadaff, edge: 0x4fc8ff },
};

/** The terrace look of a boss fight (#1551): the arena board with the boss space's sun, its hemisphere, the colour beyond the board and the tint of the lit board leaning to its surround. */
export function terraceSpaceLook(space: BossSpace): BoardLook {
  return {
    ...TERRACE_LOOK,
    sun: space.sun,
    sunIntensity: TERRACE_LOOK.sunIntensity * space.intensity,
    elevation: space.elevation,
    azimuth: space.azimuth,
    sky: mixHex(TERRACE_LOOK.sky, space.surround, space.sky * 0.2),
    background: mixHex(TERRACE_LOOK.background, space.surround, space.sky),
    tint: mixHex(TERRACE_LOOK.tint, space.surround, space.ground * 0.4), // the lit board and its rim lean to the surround, the cells' own multiplier unchanged
  };
}
