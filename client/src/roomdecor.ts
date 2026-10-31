// The wall, the arches, the floor and the props of the refined room (#1138): pure data and generated pixels (no file to
// load), main.ts builds the meshes. A dark steel bay with the deck's tint and amber as its only colours.
import type { Deck } from './deck';
import { DECK_TINTS } from './roomrefined';

/** The three steel tones of the arches and the props, dark to light. */
export const STEELS = [0x2b3138, 0x3a4149, 0x4b535c] as const;
/** The amber of the hazard marking and of the one strip that is not the deck's tint. */
export const AMBER = 0xffb000;

export interface DecorPart {
  id: string;
  type: 'box' | 'cylinder';
  /** A box's width, height, depth; a cylinder's radius, radius, height, radial segments. */
  size: readonly number[];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  color: number;
  roughness: number;
  metalness: number;
  /** A strip or a lit accent: its own light, the only thing the bloom takes. */
  emissive?: number;
}

/** The far wall: a plane of steel panels, its place and size. */
export const WALL = { z: -7.5, y: 6, width: 34, height: 12, repeat: [8, 3] as const };
/** The floor: a plane over the room's deck, its size and the world z band of the amber hazard marking (the board's near side). */
export const FLOOR = { size: 32, hazardFrom: 9.5, hazardTo: 11, cell: 2 };

const strip = (id: string, y: number, color: number): DecorPart => ({
  id, type: 'box', size: [24, 0.14, 0.14], position: [0, y, WALL.z + 0.1], rotation: [0, 0, 0], color, roughness: 0.3, metalness: 0, emissive: color,
});

/** Three emissive strips on the wall: two in the deck's tint, one amber. */
export function wallStrips(deck: Deck): DecorPart[] {
  const tint = DECK_TINTS[deck];
  return [strip('strip-high', 4, tint), strip('strip-mid', 2.6, AMBER), strip('strip-low', 1.2, tint)];
}

/** Two dark steel gantry arches, each two posts and a beam, with four rivets on its beam. */
export function gantryArches(): DecorPart[] {
  return [-6.5, -4.5].flatMap((z, i) => {
    const steel = { color: STEELS[0], roughness: 0.6, metalness: 0.4, rotation: [0, 0, 0] as const };
    const arch: DecorPart[] = [
      { id: `arch-${i}-post-l`, type: 'box', size: [0.5, 9, 0.5], position: [-9, 4.5, z], ...steel },
      { id: `arch-${i}-post-r`, type: 'box', size: [0.5, 9, 0.5], position: [9, 4.5, z], ...steel },
      { id: `arch-${i}-beam`, type: 'box', size: [18.5, 0.6, 0.5], position: [0, 9.2, z], ...steel },
    ];
    const rivets = [-8, -3, 3, 8].map<DecorPart>((x, k) => ({
      id: `arch-${i}-rivet-${k}`, type: 'cylinder', size: [0.09, 0.09, 0.06, 8], position: [x, 9.2, z + 0.27], rotation: [Math.PI / 2, 0, 0], color: STEELS[2], roughness: 0.4, metalness: 0.7,
    }));
    return [...arch, ...rivets];
  });
}

/** Crates, canisters, a conduit and a slate in three steel tones; the crate, the canister and the slate each carry one lit accent. */
export function props(deck: Deck): DecorPart[] {
  const tint = DECK_TINTS[deck];
  const accent = (id: string, at: readonly [number, number, number]): DecorPart => ({
    id: `${id}-accent`, type: 'box', size: [0.3, 0.06, 0.06], position: at, rotation: [0, 0, 0], color: tint, roughness: 0.3, metalness: 0, emissive: tint,
  });
  return [
    { id: 'crate-a', type: 'box', size: [1.4, 1.2, 1.4], position: [-10, 0.3, -6], rotation: [0, 0.3, 0], color: STEELS[0], roughness: 0.7, metalness: 0.3 },
    accent('crate-a', [-10, 0.9, -5.28]),
    { id: 'crate-b', type: 'box', size: [1.1, 0.9, 1.1], position: [-11.4, 0.14, -4.6], rotation: [0, -0.5, 0], color: STEELS[1], roughness: 0.7, metalness: 0.3 },
    { id: 'canister-a', type: 'cylinder', size: [0.45, 0.45, 1.6, 12], position: [10.5, 0.49, -5], rotation: [0, 0, 0], color: STEELS[2], roughness: 0.5, metalness: 0.5 },
    accent('canister-a', [10.5, 0.8, -4.54]),
    { id: 'canister-b', type: 'cylinder', size: [0.38, 0.38, 1.3, 12], position: [11.5, 0.34, -3.6], rotation: [0, 0, 0], color: STEELS[1], roughness: 0.5, metalness: 0.5 },
    { id: 'conduit', type: 'cylinder', size: [0.14, 0.14, 14, 8], position: [0, 0, -7.1], rotation: [0, 0, Math.PI / 2], color: STEELS[1], roughness: 0.4, metalness: 0.6 },
    { id: 'slate', type: 'box', size: [2.2, 1.4, 0.08], position: [10.5, 1.4, -7.3], rotation: [0, 0, 0], color: STEELS[0], roughness: 0.3, metalness: 0.2 },
    accent('slate', [10.5, 0.62, -7.22]),
  ];
}

/** RGBA pixels of a `size` square of steel panels, two by two, each a shade from the next, a 1 px dark seam between them. */
export function wallPixels(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const seam = x % half === 0 || y % half === 0;
      const v = seam ? 0x14 : 0x5a + ((Math.floor(x / half) + Math.floor(y / half)) % 2) * 10;
      px.set([v, v + 4, v + 8, 255], (y * size + x) * 4);
    }
  return px;
}

/** RGBA pixels of the floor, `size` square for FLOOR.size metres: plated steel, a 1 px grid every FLOOR.cell metres and diagonal
 * amber hazard stripes between FLOOR.hazardFrom and FLOOR.hazardTo (world z; the rows run from -size/2 to size/2). */
export function floorPixels(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const cell = (FLOOR.cell / FLOOR.size) * size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const z = ((y + 0.5) / size - 0.5) * FLOOR.size;
      let rgb: [number, number, number] = x % cell < 1 || y % cell < 1 ? [0x1c, 0x21, 0x26] : [0x34, 0x3a, 0x41];
      if (z >= FLOOR.hazardFrom && z < FLOOR.hazardTo) rgb = (x + y) % 16 < 8 ? [0xff, 0xb0, 0x00] : [0x16, 0x18, 0x1a];
      px.set([...rgb, 255], (y * size + x) * 4);
    }
  return px;
}
