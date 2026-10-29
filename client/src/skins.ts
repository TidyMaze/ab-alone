// The dark shell skins (#377): the look of the enemy marble, a choice of the settings menu. Each one is an ambientCG PBR
// material (CC0, ambientcg.com), opaque and in its own colours: its albedo, normal and roughness maps and every other map
// its asset ships, in textures/pbr/skin-<asset>-<map>.jpg. Pure data, no Three.js: main.ts builds one material per skin and
// loads its maps the first time it is worn.

/** The maps an ambientCG asset ships besides colour, normal and roughness, each set on the material. Displacement is
 * skipped: the normal map carries the relief, a 32-segment sphere cannot displace. */
export type Extra = 'metalness' | 'ao' | 'emission';

export interface Skin {
  id: string;
  name: string;
  side: 1; // the shell side of marbles.ts: the skin never reaches the player's marble
  asset: string; // the ambientCG material its maps come from
  extra: readonly Extra[];
  tile: number; // repeats of the maps round the sphere
  color: number; // the mean colour of the albedo: what the marks and accents on a shell are checked against
}

const dark = (id: string, name: string, asset: string, color: number, tile: number, extra: readonly Extra[] = []): Skin =>
  ({ id, name, side: 1, asset, extra, tile, color });

export const SKINS: readonly Skin[] = [
  dark('scarab', 'Leather', 'Leather027', 0x101010, 4),
  dark('obsidian', 'Black porcelain', 'Porcelain003', 0x000000, 1),
  dark('slag', 'Lava', 'Lava002', 0x44363f, 2, ['emission']),
  dark('hex', 'Fabric', 'Fabric004', 0x302f32, 4, ['metalness']),
  dark('ash', 'Rubber', 'Rubber001', 0x202122, 4),
  dark('riveted', 'Steel', 'Metal027', 0x2e2c35, 2, ['metalness']),
  dark('tar', 'Painted steel', 'Metal028', 0x1d2120, 2, ['metalness']),
  dark('ember', 'Lava veins', 'Lava001', 0x583a3d, 2, ['emission']),
  dark('copper', 'Black onyx', 'Onyx013', 0x3b3631, 1),
  dark('void', 'Terrazzo', 'Terrazzo015', 0x3e4a4f, 4),
];

export const DEFAULT_SKIN = 'scarab';

/** The skin of an id, Leather when the id is missing or unknown (a stale stored value). */
export const skinById = (id: string | null): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0]!;

/** The id after `id` in the list, the first one after the last: what a press on the menu item picks. */
export const nextSkin = (id: string): string => SKINS[(SKINS.indexOf(skinById(id)) + 1) % SKINS.length]!.id;
