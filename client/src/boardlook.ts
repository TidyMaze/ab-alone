// The three boards of a lair fight (docs/specs/openworld.md section 11, #1496): the hexagonal board dressed for the hour the hero entered the
// lair at. Data only: scene.ts `setBoardLook` applies one to the terrace; a fight outside the Open world keeps `TERRACE_LOOK`, the board as it was.
import type { Phase } from './daynight';
import { SUN, TERRACE_EXPOSURE } from './tablezero';
import type { Space } from './bossspace';
import { mixHex } from './daynight';
import type { Deck } from './deck';
import { DECK_KEY } from './neonlook';

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

/** The arena board with the colour beyond it, the sky and the tint of the lit board leaning to `surround`, ground 0 to 0.6 and sky 0 to 0.5 of the way. */
const leaning = (surround: number, ground: number, sky: number): BoardLook => ({
  ...TERRACE_LOOK,
  sky: mixHex(TERRACE_LOOK.sky, surround, sky * 0.2),
  background: mixHex(TERRACE_LOOK.background, surround, sky),
  tint: mixHex(TERRACE_LOOK.tint, surround, ground * 0.4), // the lit board and its rim lean to the surround, the cells' own multiplier unchanged
});

/** The terrace look of a boss fight or an act of a run (#1551): the arena board with the space's sun, its hemisphere, the colour beyond the board and the tint of the lit board leaning to its surround. */
export function terraceSpaceLook(space: Space): BoardLook {
  return { ...leaning(space.surround, space.ground, space.sky), sun: space.sun, sunIntensity: TERRACE_LOOK.sunIntensity * space.intensity, elevation: space.elevation, azimuth: space.azimuth };
}

const DECK_LOOKS: Partial<Record<Deck, BoardLook>> = {
  mess: leaning(mixHex(DECK_KEY.mess.key, 0xd9822b, 0.5), 0.6, 0.45), // the warm lamp of the laminate: its key with sodium, or the lamp's own off-white would not show
  cargo: leaning(DECK_KEY.cargo.key, 0.6, 0.45), // the cold slate of the hold
};

/** The terrace look of a deck's own game (#1551), the surround the neon look gives a deck as its key: the Mess and the Cargo hold, the decks a fight can be played on with no boss space; null for the others. */
export const terraceDeckLook = (deck: Deck): BoardLook | null => DECK_LOOKS[deck] ?? null;
