// The dark shell skins (#377, the sketches of the issue): the look of the enemy marble, a choice of the settings menu.
// Pure data, no Three.js: main.ts builds one material per skin, skinart.ts draws its pattern.
import { SHELL } from './marbles';

export type PatternId = 'ridges' | 'arc' | 'cracks' | 'hexes' | 'swirl' | 'rivets' | 'drips' | 'rings' | 'traces' | 'eye' | 'frost' | 'pearl' | 'facets';

export interface Skin {
  id: string;
  name: string;
  side: 1; // the shell side of marbles.ts: the skin never reaches the player's glass
  color: number; // the base colour
  roughness: number;
  metalness: number;
  pattern: PatternId; // 'ridges' is the normal map of #293, the others are drawn by skinart.ts
  ink: number; // the pattern's main colour
  accent: number; // its second colour: rivets, nodes, the bright centre
  glow?: number; // emissive strength of the pattern, only for the skins that glow (cracks, ember, eye)
}

const dark = (id: string, name: string, color: number, pattern: PatternId, ink: number, accent: number, rest: Partial<Skin> = {}): Skin =>
  ({ id, name, side: 1, color, roughness: 0.6, metalness: 0.1, pattern, ink, accent, ...rest });

export const SKINS: readonly Skin[] = [
  dark('scarab', 'Scarab ridges', SHELL.color, 'ridges', 0, 0, { roughness: SHELL.roughness, metalness: SHELL.metalness }),
  dark('obsidian', 'Obsidian', 0x0e0f12, 'arc', 0x3a3f4a, 0xffffff, { roughness: 0.15, metalness: 0.3 }),
  dark('slag', 'Slag crust', 0x25201b, 'cracks', 0x5a2010, 0x9a4a28, { glow: 0.4 }),
  dark('hex', 'Hex chitin', 0x1b1f1c, 'hexes', 0x3b443e, 0x3b443e),
  dark('ash', 'Ash swirl', 0x2c2b2a, 'swirl', 0x4d4b48, 0x4d4b48, { roughness: 0.9, metalness: 0 }),
  dark('riveted', 'Riveted hull', 0x272a2d, 'rivets', 0x3a3f44, 0x6b7178, { roughness: 0.5, metalness: 0.5 }),
  dark('tar', 'Tar drip', 0x0c0b0a, 'drips', 0x2b2622, 0x2b2622, { roughness: 0.25 }),
  dark('ember', 'Ember core', 0x161210, 'rings', 0x3a0e06, 0x4e1a0c, { glow: 0.3 }),
  dark('copper', 'Copper circuit', 0x121416, 'traces', 0xb87333, 0xd79a5a, { roughness: 0.4, metalness: 0.4 }),
  dark('void', 'Void eye', 0x0b0b10, 'eye', 0x1e1e3a, 0x30288a, { glow: 0.4 }),
];

export const DEFAULT_SKIN = 'scarab';

/** The skin of an id, Scarab ridges when the id is missing or unknown (a stale stored value). */
export const skinById = (id: string | null): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0]!;

/** The id after `id` in the list, the first one after the last: what a press on the menu item picks. */
export const nextSkin = (id: string): string => SKINS[(SKINS.indexOf(skinById(id)) + 1) % SKINS.length]!.id;
