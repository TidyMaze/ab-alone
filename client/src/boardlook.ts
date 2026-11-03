// The three boards of a lair fight (docs/specs/openworld.md section 11, #1496): the hexagonal board dressed for the hour the hero entered the
// lair at. Data only: scene.ts `setBoardLook` applies one to the terrace; a fight outside the Open world keeps `TERRACE_LOOK`, the board as it was.
import type { Phase } from './daynight';
import { SUN, TERRACE_EXPOSURE } from './tablezero';

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
  edge: null,
};

/** Day: bright, warm ground. Dusk: orange and violet light from low, long shadows. Night: a dark blue ground, a moonlight key, glowing cell edges. */
export const BOARD_LOOKS: Readonly<Record<Phase, BoardLook>> = {
  day: { sun: 0xffe0b0, sunIntensity: 5.6, elevation: 34, azimuth: 25, sky: 0xb4ccea, ground: 0x9a8466, hemisphere: 1.7, background: 0x6f93b8, exposure: 1.65, tint: 0xfff5e0, dome: 0xffffff, edge: null },
  dusk: { sun: 0xff7a38, sunIntensity: 4.6, elevation: 8, azimuth: 62, sky: 0xa584b8, ground: 0x5a3a30, hemisphere: 1.3, background: 0x3a2a4a, exposure: 1.35, tint: 0xffd8c0, dome: 0xd0a090, edge: null },
  night: { sun: 0x8fb0ff, sunIntensity: 2.6, elevation: 40, azimuth: -35, sky: 0x5a72c0, ground: 0x1a2238, hemisphere: 1.4, background: 0x070a16, exposure: 1.25, tint: 0xa8b8ff, dome: 0x303a60, edge: 0x4fc8ff },
};
