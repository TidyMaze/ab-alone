// The dark shell skins (#377): the look of the enemy marble, a choice of the settings menu. Each one is an ambientCG PBR
// material (CC0, ambientcg.com), its albedo, normal and roughness maps (and an emission map for the lavas) in
// textures/pbr/skin-<asset>-<map>.jpg. Pure data, no Three.js: main.ts builds one material per skin and loads its maps
// the first time it is worn.

export interface Skin {
  id: string;
  name: string;
  side: 1; // the shell side of marbles.ts: the skin never reaches the player's glass
  asset: string; // the ambientCG material its maps come from
  tint: number; // multiplies the albedo: a shell is meant to stay dark, so a pale albedo is darkened here
  color: number; // the mean colour of the albedo times the tint: what the marks and accents on a shell are checked against
  metalness: number;
  tile: number; // repeats of the maps round the sphere
  glow?: number; // emissive strength of the emission map, only for the lavas
}

const dark = (id: string, name: string, asset: string, color: number, tile: number, rest: Partial<Skin> = {}): Skin =>
  ({ id, name, side: 1, asset, tint: 0xffffff, color, metalness: 0, tile, ...rest });

export const SKINS: readonly Skin[] = [
  dark('scarab', 'Leather', 'Leather027', 0x101010, 4),
  dark('obsidian', 'Black porcelain', 'Porcelain003', 0x000000, 1),
  dark('slag', 'Lava', 'Lava002', 0x1d161a, 2, { tint: 0x808080, glow: 0.4 }),
  dark('hex', 'Fabric', 'Fabric004', 0x131214, 4, { tint: 0x808080 }),
  dark('ash', 'Rubber', 'Rubber001', 0x202122, 4),
  dark('riveted', 'Steel', 'Metal027', 0x121115, 2, { tint: 0x808080, metalness: 0.5 }),
  dark('tar', 'Painted steel', 'Metal028', 0x090b0a, 2, { tint: 0x808080, metalness: 0.5 }),
  dark('ember', 'Lava veins', 'Lava001', 0x28181a, 2, { tint: 0x808080, glow: 0.3 }),
  dark('copper', 'Black onyx', 'Onyx013', 0x141210, 1, { tint: 0x707070 }),
  dark('void', 'Terrazzo', 'Terrazzo015', 0x1a2023, 4, { tint: 0x808080 }),
];

export const DEFAULT_SKIN = 'scarab';

/** The skin of an id, Leather when the id is missing or unknown (a stale stored value). */
export const skinById = (id: string | null): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0]!;

/** The id after `id` in the list, the first one after the last: what a press on the menu item picks. */
export const nextSkin = (id: string): string => SKINS[(SKINS.indexOf(skinById(id)) + 1) % SKINS.length]!.id;
