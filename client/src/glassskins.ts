// The pale glass skins (#377), the look of the player's marble: a choice of the settings menu, beside the shell skin.
// Pure data, no Three.js: main.ts builds one material per skin, skinart.ts draws its pattern. Smoked glass is the
// current glass (marbles.ts GLASS), the default.
import type { PatternId } from './skins';

export interface GlassSkin {
  id: string;
  name: string;
  side: 2; // the glass side of marbles.ts: the skin never reaches the enemy shell
  color: number; // the base colour
  roughness: number;
  pattern: PatternId | null; // null: the plain colour, no texture
  ink: number; // the pattern's main colour
  accent: number; // its second colour
  core?: number; // the colour of the inner light, the cyan core of GLASS when absent
}

const pale = (id: string, name: string, color: number, roughness: number, pattern: PatternId | null, ink = 0, accent = 0): GlassSkin =>
  ({ id, name, side: 2, color, roughness, pattern, ink, accent });

export const GLASS_SKINS: readonly GlassSkin[] = [
  pale('smoked', 'Smoked glass', 0x2c363d, 0.2, null),
  // The body is a deep tinted glass (it must read 3:1 on the cream cells); the pale look is the motif on it.
  pale('frost', 'Frost', 0x2b3d47, 0.3, 'frost', 0xaec4d0, 0xe6eef2),
  pale('pearl', 'Pearl', 0x221e25, 0.25, 'pearl', 0x5e4f63, 0x4f6370),
  pale('bone', 'Bone ivory', 0x221e16, 0.5, 'swirl', 0x8a7c5c, 0x9c8f70),
  pale('moon', 'Hollow moon', 0x17181c, 0.35, 'pearl', 0x55534d, 0x5e5b55),
  pale('kintsugi', 'Kintsugi porcelain', 0x1f2a2e, 0.2, 'cracks', 0xc9a227, 0xe0c060),
  { ...pale('lantern', 'Lantern core', 0x3a1f0e, 0.35, 'rings', 0xd9822b, 0xf2c27a), core: 0xf2c27a },
  pale('prism', 'Ice prism', 0x0f1f29, 0.1, 'facets', 0x5f8a9a, 0x4f7585),
  pale('nebula', 'Nebula', 0x17112a, 0.3, 'swirl', 0x6d5c9a, 0x8a5f7f),
  pale('visor', 'Helmet visor', 0x1a2228, 0.15, 'rivets', 0x7fd6e8, 0xd8f6fc),
];

export const DEFAULT_GLASS_SKIN = 'smoked';

/** The glass skin of an id, Smoked glass when the id is missing or unknown (a stale stored value). */
export const glassSkinById = (id: string | null): GlassSkin => GLASS_SKINS.find((s) => s.id === id) ?? GLASS_SKINS[0]!;

/** The id after `id` in the list, the first one after the last: what a press on the menu item picks. */
export const nextGlassSkin = (id: string): string => GLASS_SKINS[(GLASS_SKINS.indexOf(glassSkinById(id)) + 1) % GLASS_SKINS.length]!.id;
