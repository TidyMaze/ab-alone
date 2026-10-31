// The white skins (#377), the look of the player's marble: a choice of the settings menu, beside the shell skin. Each one
// is an ambientCG PBR material (CC0, ambientcg.com), an opaque sphere in its own colours like the shells: its albedo,
// normal and roughness maps and every other map its asset ships, in textures/pbr/skin-<asset>-<map>.jpg. Pure data, no
// Three.js: main.ts builds one material per skin and loads its maps the first time it is worn.
import type { Extra } from './skins';

export interface GlassSkin {
  id: string;
  name: string;
  side: 2; // the player's side of marbles.ts: the skin never reaches the enemy shell
  asset: string; // the ambientCG material its maps come from
  extra: readonly Extra[];
  tile: number; // repeats of the maps round the sphere
  color: number; // the mean colour of the albedo, in sRGB: the one tone of the tonal look (#1138)
}

const pale = (id: string, name: string, asset: string, color: number, tile: number, extra: readonly Extra[] = []): GlassSkin =>
  ({ id, name, side: 2, asset, extra, tile, color });

export const GLASS_SKINS: readonly GlassSkin[] = [
  pale('smoked', 'Marble', 'Marble025', 0xd6d6d6, 1),
  pale('frost', 'Terracotta', 'GlazedTerracotta003', 0xf4f8fa, 2),
  pale('pearl', 'Porcelain', 'Porcelain001', 0xf9f9f9, 1),
  pale('bone', 'Ivory', 'Ivory002B', 0xdfd8c2, 1),
  pale('moon', 'Styrofoam', 'Styrofoam004', 0xe8e9ef, 2, ['ao']),
  pale('kintsugi', 'Veined marble', 'Marble021', 0xf3f1f0, 1),
  pale('lantern', 'Warm ivory', 'Ivory001A', 0xc7b88d, 1),
  pale('prism', 'Rock', 'Rock025', 0xa9aaac, 2, ['ao']),
  pale('nebula', 'White onyx', 'Onyx015', 0xcdcac8, 1),
  pale('visor', 'Plastic', 'Plastic013A', 0xece8e8, 1),
];

export const DEFAULT_GLASS_SKIN = 'smoked';

/** The white skin of an id, Marble when the id is missing or unknown (a stale stored value). */
export const glassSkinById = (id: string | null): GlassSkin => GLASS_SKINS.find((s) => s.id === id) ?? GLASS_SKINS[0]!;

/** The id after `id` in the list, the first one after the last: what a press on the menu item picks. */
export const nextGlassSkin = (id: string): string => GLASS_SKINS[(GLASS_SKINS.indexOf(glassSkinById(id)) + 1) % GLASS_SKINS.length]!.id;
