// The space of each boss fight (#1551, art.md Decks): its own light, rim, surround and scatter, so the fifteen fights read as fifteen places
// and none as the plain Mess table. Data only, keyed by boss id: the neon look (neonlook.ts, scene.ts) and the terrace look (boardlook.ts)
// both read a row. The cells, the marbles and the tells keep their colours; every colour is a token of the palette of art.md.
import { DECK_PARTICLES, type DeckParticles } from './deck';
import { mixHex } from './daynight';
import type { EntranceSpec } from './entrance';

/** What a boss fight and a rogue-lite act (#1551) share: the light, the rim, the surround and the scatter. A boss adds its entrance beat. */
export interface Space {
  /** The rim's glow and the key the surround leans to; the posts' glow. */
  key: number;
  accent: number;
  /** The sun: colour, degrees over the horizon, degrees round the board (0 in front, 90 from the left, negative from the right), and its strength against the arena's. */
  sun: number;
  elevation: number;
  azimuth: number;
  intensity: number;
  /** The colour the ground outside the board and the sky lean to (a palette token, or a mix of two), and how far: the ground 0 to 0.6, the sky 0 to 0.5. */
  surround: number;
  ground: number;
  sky: number;
  /** The particles round the board, in place of the deck's. */
  scatter: DeckParticles;
}

/** The space of a boss fight: its entrance beat (#1551), the camera move (beat), the side it starts on (side, degrees) and the share of the light the fight starts with (dark), come from EntranceSpec. */
export interface BossSpace extends Space, EntranceSpec {}

const flecks = (kind: DeckParticles['kind'], count: number, drift: DeckParticles['drift'], color: number, size: number, opacity: number): DeckParticles => ({ kind, count, drift, color, size, opacity });

/** The plain Mess table of a bot or hot-seat game, as the neon look draws it: what no boss fight may look like. */
export const MESS_SPACE: Space = { key: 0xd8d4c8, accent: 0xf2f0ea, sun: 0xe8f0ff, elevation: 24, azimuth: 50, intensity: 1, surround: 0xd8d4c8, ground: 0.4, sky: 0.25, scatter: DECK_PARTICLES.mess };

const NONE = flecks('none', 0, [0, 0, 0], 0xe8f0ff, 0, 0);

export const BOSS_SPACE: Record<string, BossSpace> = {
  // the mirror room: a cold white light from the other side, a few glints
  echo: { key: 0xf2f0ea, accent: 0x7fd6e8, sun: 0xe8f0ff, elevation: 28, azimuth: -55, intensity: 1, surround: 0xe8f0ff, ground: 0.25, sky: 0.3, scatter: flecks('dust', 90, [0.02, 0.01, 0], 0xe8f0ff, 0.05, 0.3), beat: 'orbit', side: -50, dark: 0.15 },
  // the cargo hold: a hard low light raking from the left, rust and ore falling
  hull: { key: 0xd9822b, accent: 0xd8d4c8, sun: 0xd8d4c8, elevation: 16, azimuth: 85, intensity: 1.15, surround: mixHex(0xd9822b, 0x39466a, 0.5), ground: 0.45, sky: 0.15, scatter: flecks('ore', 200, [-0.03, -0.05, 0.02], 0xd9822b, 0.08, 0.4), beat: 'rise', side: 90, dark: 0.1 },
  // the furnace: sodium, steam climbing
  choir: { key: 0xd9822b, accent: 0x6a609f, sun: 0xd8d4c8, elevation: 40, azimuth: 15, intensity: 1, surround: 0xd9822b, ground: 0.55, sky: 0.4, scatter: flecks('steam', 240, [0.02, 0.12, -0.02], 0xd9822b, 0.14, 0.32), beat: 'rise', side: -50, dark: 0.1 },
  // the chapel: candle light from above, smoke
  chaplain: { key: 0x6a609f, accent: 0x9a6bff, sun: 0xd8d4c8, elevation: 55, azimuth: 0, intensity: 0.8, surround: 0x6a609f, ground: 0.5, sky: 0.35, scatter: flecks('smoke', 150, [-0.02, 0.07, 0.01], 0xd8d4c8, 0.11, 0.28), beat: 'drop', side: 90, dark: 0.05 },
  // the bridge: clean cold white, nothing in the air
  ballast: { key: 0xe8f0ff, accent: 0x19e6ff, sun: 0xe8f0ff, elevation: 24, azimuth: 50, intensity: 1.1, surround: 0xe8f0ff, ground: 0.1, sky: 0.1, scatter: NONE, beat: 'pull', side: -50, dark: 0.3 },
  // the cold spores of the alien, a light straight down
  alien: { key: 0x5fd0e6, accent: 0x19e6ff, sun: 0x5fd0e6, elevation: 50, azimuth: -25, intensity: 0.9, surround: 0x5fd0e6, ground: 0.5, sky: 0.3, scatter: flecks('smoke', 180, [0, 0.05, 0.02], 0x5fd0e6, 0.1, 0.3), beat: 'drop', side: -50, dark: 0.1 },
  // the rail yard: a long low light along the rails from the right, steel dust
  railyard: { key: 0xd9822b, accent: 0x7fd6e8, sun: 0xe8f0ff, elevation: 14, azimuth: -85, intensity: 1, surround: mixHex(0xd8d4c8, 0xd9822b, 0.5), ground: 0.3, sky: 0.2, scatter: flecks('ore', 120, [0.06, -0.01, 0], 0x7fd6e8, 0.07, 0.35), beat: 'pull', side: -90, dark: 0.15 },
  // the magnet cranes: a violet light and filings drifting sideways
  magnetizer: { key: 0x9a6bff, accent: 0xd9822b, sun: 0xe8f0ff, elevation: 32, azimuth: 30, intensity: 1, surround: 0x9a6bff, ground: 0.4, sky: 0.3, scatter: flecks('dust', 200, [0.08, 0, 0.02], 0x7fd6e8, 0.06, 0.35), beat: 'pull', side: 50, dark: 0.1 },
  // the beacons: space, a hard side light, cyan stardust
  pulsar: { key: 0x19e6ff, accent: 0xe8f0ff, sun: 0xe8f0ff, elevation: 20, azimuth: 100, intensity: 1.2, surround: 0x39466a, ground: 0.1, sky: 0.4, scatter: flecks('dust', 160, [0, 0, 0.1], 0x19e6ff, 0.05, 0.3), beat: 'pull', side: 90, dark: 0 },
  // the watch chamber: a pale light from above, thin smoke
  overseer: { key: 0x6a609f, accent: 0x7fd6e8, sun: 0x7fd6e8, elevation: 62, azimuth: -5, intensity: 0.85, surround: mixHex(0x6a609f, 0x7fd6e8, 0.5), ground: 0.5, sky: 0.2, scatter: flecks('smoke', 90, [0, 0.04, 0], 0x7fd6e8, 0.09, 0.22), beat: 'drop', side: 50, dark: 0.15 },
  // the conveyor floor: a work light from the left, weld sparks climbing
  assembly: { key: 0x7fd6e8, accent: 0xd9822b, sun: 0xd8d4c8, elevation: 36, azimuth: 70, intensity: 1.1, surround: 0xd8d4c8, ground: 0.3, sky: 0.1, scatter: flecks('ore', 140, [0, 0.1, 0], 0xf2f0ea, 0.06, 0.4), beat: 'orbit', side: 50, dark: 0.1 },
  // the reactor: a hot light from the right, embers
  core: { key: 0x39466a, accent: 0xd9822b, sun: 0xd8d4c8, elevation: 45, azimuth: -40, intensity: 1.2, surround: mixHex(0xd9822b, 0x9a6bff, 0.5), ground: 0.6, sky: 0.45, scatter: flecks('dust', 160, [0, 0.09, 0], 0xd9822b, 0.07, 0.4), beat: 'rise', side: -90, dark: 0.2 },
  // two galleys, one cold and one warm, a flat front light
  dual: { key: 0x5fd0e6, accent: 0xd9822b, sun: 0xf2f0ea, elevation: 35, azimuth: 0, intensity: 0.95, surround: 0x5fd0e6, ground: 0.25, sky: 0.2, scatter: flecks('dust', 120, [0.02, 0.01, 0], 0xd8d4c8, 0.06, 0.3), beat: 'orbit', side: -90, dark: 0.2 },
  // the vermin: a dim light from the far left, a thick drift of dark flecks
  swarm: { key: 0x39466a, accent: 0xd9822b, sun: 0xd8d4c8, elevation: 22, azimuth: 110, intensity: 0.75, surround: 0xd9822b, ground: 0.4, sky: 0.25, scatter: flecks('smoke', 240, [-0.05, 0.02, 0.03], 0x39466a, 0.07, 0.4), beat: 'rise', side: 50, dark: 0.05 },
  // the night watch: one dim cold lamp from the right, violet dark
  stalker: { key: 0x9a6bff, accent: 0xf2f0ea, sun: 0x7fd6e8, elevation: 50, azimuth: -30, intensity: 0.6, surround: mixHex(0x6a609f, 0x39466a, 0.5), ground: 0.5, sky: 0.4, scatter: flecks('smoke', 150, [0, 0.03, 0], 0x9a6bff, 0.1, 0.25), beat: 'drop', side: -90, dark: 0 },
};

/** The space of fight `id`; null for a mode, no fight or a boss the client does not know. */
export function bossSpaceOf(id: string | null | undefined): BossSpace | null {
  return BOSS_SPACE[id ?? ''] ?? null;
}

const SAGE = mixHex(0x5fd0e6, 0xd9822b, 0.5); // the cold cyan and the sodium make a grey green: the only green the palette can say

/** The space of each biome of a rogue-lite run (#1551, roguelite.md section 18), by the biome's id: what a plain fight, an elite and the fights of the act are drawn in. The act's boss
 * keeps its own space (`BOSS_SPACE`), the violet rim and posts of a run stay on top (neonlook.ts `RUN_KEY`). */
export const ACT_SPACE: Record<string, Space> = {
  // the meadow: a clear morning light, a pale green ground, pollen rising
  meadow: { key: 0x5fd0e6, accent: 0xd8d4c8, sun: 0xf2f0ea, elevation: 40, azimuth: 20, intensity: 1.1, surround: SAGE, ground: 0.35, sky: 0.25, scatter: flecks('dust', 90, [0.01, 0.04, 0.01], 0xd8d4c8, 0.05, 0.3) },
  // the forest: a dim cold light from above through the trees, spores
  forest: { key: 0x7fd6e8, accent: 0x5fd0e6, sun: 0x5fd0e6, elevation: 55, azimuth: -35, intensity: 0.8, surround: mixHex(0x5fd0e6, 0x39466a, 0.5), ground: 0.55, sky: 0.4, scatter: flecks('smoke', 200, [0, 0.05, 0.02], 0x5fd0e6, 0.1, 0.3) },
  // the tundra: a low white light from the right, snow blown across
  tundra: { key: 0xe8f0ff, accent: 0x7fd6e8, sun: 0xe8f0ff, elevation: 20, azimuth: -60, intensity: 1.2, surround: 0xe8f0ff, ground: 0.2, sky: 0.35, scatter: flecks('dust', 220, [-0.03, -0.06, 0.02], 0xf2f0ea, 0.06, 0.4) },
  // the desert: a hard sodium light low from the left, sand on the wind
  desert: { key: 0xd9822b, accent: 0xd8d4c8, sun: 0xd9822b, elevation: 18, azimuth: 80, intensity: 1.15, surround: mixHex(0xd9822b, 0xd8d4c8, 0.5), ground: 0.4, sky: 0.3, scatter: flecks('dust', 160, [0.09, 0, 0.02], 0xd9822b, 0.06, 0.35) },
  // the badlands: a dull light from the right, red rock and falling grit
  badlands: { key: 0x9a6bff, accent: 0xd9822b, sun: 0xd8d4c8, elevation: 30, azimuth: -25, intensity: 0.9, surround: 0xd9822b, ground: 0.5, sky: 0.2, scatter: flecks('ore', 140, [0.02, -0.04, 0], 0xd9822b, 0.09, 0.35) },
  // the archipelago: a bright light off the water, sea mist
  archipelago: { key: 0x19e6ff, accent: 0xe8f0ff, sun: 0x7fd6e8, elevation: 45, azimuth: 40, intensity: 1, surround: 0x39466a, ground: 0.15, sky: 0.4, scatter: flecks('smoke', 120, [0.02, 0.03, 0], 0x7fd6e8, 0.12, 0.22) },
};

/** The space of the biome `id` of a rogue-lite run; null for a fight outside a run or an unknown biome. */
export function actSpaceOf(id: string | null | undefined): Space | null {
  return ACT_SPACE[id ?? ''] ?? null;
}
