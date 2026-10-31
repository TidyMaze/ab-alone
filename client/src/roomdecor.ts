// The refined room's decor (#1138), the simple version: flat dark steel, four lit strips, a hazard stripe, four crates. Pure data
// (no generated texture) and the restyle of the bay's materials; roomscene.ts builds the meshes.
import * as THREE from 'three/webgpu';
import type { Deck } from './deck';
import { ROOM_SURFACE } from './room';
import { DECK_TINTS } from './roomrefined';

/** The flat colours of the room: dark steel, no map. */
export const STEEL = { floor: 0x222b32, wall: 0x1b2229, frame: 0x2a333b, crate: 0x2f3841 } as const;
/** The amber of the hazard chevrons and of the one amber strip. */
export const AMBER = 0xffb000;
/** The bay's own hex floor, kept and darkened: its colour multiplies the floor's map. */
export const DARK_FLOOR = 0x59626a;

export interface DecorPart {
  id: string;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  color: number;
  /** A strip: its own light, the only thing the bloom takes. */
  emissive?: number;
}

/** The far wall: a flat plane, its place and size. */
export const WALL = { z: -6.6, y: 6, width: 34, height: 12 };

const strip = (id: string, y: number, color: number): DecorPart => ({
  id, size: [34, 0.14, 0.14], position: [0, y, WALL.z + 0.1], rotation: [0, 0, 0], color, emissive: color,
});

/** Four lit strips on the wall: three in the deck's tint, the third from the top amber. */
export function wallStrips(deck: Deck): DecorPart[] {
  const tint = DECK_TINTS[deck];
  return [strip('strip-1', 3.2, tint), strip('strip-2', 2.4, tint), strip('strip-3', 1.6, AMBER), strip('strip-4', 0.8, tint)];
}

/** A plain amber stripe across the floor on the board's near side. */
export const hazardStripe = (): DecorPart => ({
  id: 'hazard-stripe', size: [34, 0.02, 0.5], position: [0, ROOM_SURFACE.y + 0.012, 8.2], rotation: [0, 0, 0], color: AMBER,
});

/** A crate in each corner of the floor, plain steel. */
export function cornerCrates(): DecorPart[] {
  return [[-9.3, -4.2], [9.3, -4.2], [-10.4, 3.4], [10.4, 3.4]].map(([x, z], i) => ({
    id: `crate-${i}`, size: [1.3, 1.2, 1.3] as const, position: [x!, 0.3, z!] as const, rotation: [0, 0.3 + i * 0.4, 0] as const, color: STEEL.crate,
  }));
}

/** The props of room.ts the refined room keeps, for they are gameplay and not decor: the lore console's screen and desk (#511) and
 * the audio log recorder (#517), at the same place and size so the clicks and the reader camera keep working. */
export const KEPT_PROPS: ReadonlySet<string> = new Set(['console-desk', 'console-screen', 'log-recorder']);

/** The meshes of the bay the refined room does not keep: the viewport and the moon, the crane rails, the bulkhead
 * columns and walls, the radial conduits, the airlock doors and the pedestal. */
export const HIDDEN_BAY = /^(east_hollow|hollow_moon|crane|bulkhead_|radial_floor|airlock_bulkhead|pedestal)/i;

type Looks = Record<'deck' | 'bulkhead' | 'grate', THREE.MeshStandardMaterial> & Partial<Record<'hazard', THREE.MeshStandardMaterial>>;

const flatten = (m: THREE.MeshStandardMaterial, color: number): void => {
  m.color.setHex(color);
  m.map = m.normalMap = m.roughnessMap = m.metalnessMap = m.aoMap = m.displacementMap = null;
  m.roughness = 0.7;
  m.metalness = 0.3;
  m.needsUpdate = true;
};

/** Restyles the loaded bay for the refined room: the pieces it does not keep hidden, the bulkhead and the gantry frame flat dark
 * steel with no map, the bay's own hex floor kept but darker, the hazard chevrons amber. */
export function flatBay(root: THREE.Object3D, m: Looks): void {
  root.traverse((o) => {
    if (HIDDEN_BAY.test(o.name)) o.visible = false;
  });
  flatten(m.grate, STEEL.frame);
  flatten(m.bulkhead, STEEL.wall);
  m.deck.color.setHex(DARK_FLOOR);
  if (m.hazard) {
    m.hazard.color.setHex(AMBER);
    m.hazard.emissive.setHex(AMBER);
    m.hazard.emissiveIntensity = 0.8;
  }
}
