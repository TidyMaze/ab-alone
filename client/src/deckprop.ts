// The silhouette prop of each deck (#1551, art.md Decks): one piece of the deck's story standing in the surround outside the board, read
// as a shape against the sky at 960x540 and at 390x844. Procedural geometry, merged into one mesh, one flat colour, no texture.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Deck } from './deck';
import { DECK_KEY, NEON } from './neonlook';

/** One piece of a prop, centred on `at` (cells, the prop's own origin on the ground): a box, or a six-sided prism whose top is `top` times as wide as its bottom (0 is a cone). */
export interface PropPart {
  shape: 'box' | 'prism';
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  top?: number;
}

const box = (at: PropPart['at'], size: PropPart['size']): PropPart => ({ shape: 'box', at, size });
const prism = (at: PropPart['at'], size: PropPart['size'], top = 1): PropPart => ({ shape: 'prism', at, size, top });

/** The props, in cells before `PROP_SCALE`: none wider than 1.2 across the way the camera looks along the row of a desktop's side, none taller than 3 (the board is 8 wide). */
export const DECK_PROPS: Record<Deck, readonly PropPart[]> = {
  // the Mess: vent hoods over the galley, a big one and a small one on legs, each with its duct
  mess: [
    box([-0.4, 0.8, 0], [0.12, 1.6, 0.12]),
    box([0.4, 0.8, 0], [0.12, 1.6, 0.12]),
    prism([0, 1.9, 0], [1.1, 0.6, 1.1], 0.4),
    box([0, 2.55, 0], [0.3, 0.7, 0.3]),
    box([0, 1.1, -0.85], [0.12, 2.2, 0.12]),
    prism([0, 1.7, -0.85], [0.6, 0.4, 0.6], 0.4),
    box([0, 2.15, -0.85], [0.2, 0.5, 0.2]),
  ],
  // the Cargo hold: a crane, its arm out over the hold with a crate on the cable and a weight on the short side
  cargo: [
    box([0, 0.15, 0], [0.8, 0.3, 0.8]),
    box([0, 1.15, 0], [0.3, 2.3, 0.3]),
    box([0, 2.4, 0], [0.22, 0.22, 1.6]),
    box([0, 2.3, -0.7], [0.5, 0.5, 0.5]),
    box([0, 1.8, 0.6], [0.05, 1.2, 0.05]),
    box([0, 0.95, 0.6], [0.4, 0.35, 0.5]),
  ],
  // the Furnace: a tall chimney stack with its collar and a short one beside it, a pipe between
  furnace: [
    box([0, 0.25, 0], [1.2, 0.5, 1.2]),
    prism([0, 1.45, 0], [1, 2.7, 1], 0.7),
    prism([0, 2.7, 0], [0.95, 0.2, 0.95]),
    prism([0, 1.2, -0.85], [0.55, 2.4, 0.55], 0.7),
    box([0, 1.2, -0.45], [0.15, 0.15, 0.8]),
  ],
  // the Chapel: a spire with its cross, over a tower and the nave
  chapel: [
    box([0, 0.3, -0.9], [0.8, 0.6, 1]),
    box([0, 0.4, 0], [1.1, 0.8, 1.1]),
    prism([0, 1.2, 0], [0.9, 0.8, 0.9], 0.8),
    prism([0, 2.1, 0], [0.8, 1, 0.8], 0),
    box([0, 2.8, 0], [0.06, 0.4, 0.06]),
    box([0, 2.9, 0], [0.06, 0.06, 0.28]),
  ],
  // the Bridge: a navigation mast with two yards across it and the radar plate on top
  bridge: [
    box([0, 0.15, 0], [0.6, 0.3, 0.6]),
    prism([0, 1.4, 0], [0.26, 2.8, 0.26], 0.7),
    box([0, 2.4, 0], [0.12, 0.12, 1.4]),
    box([0, 1.9, 0], [0.12, 0.12, 0.9]),
    box([0, 2.85, 0], [0.35, 0.06, 0.6]),
  ],
};

/** The prop's body: the deck's key lightened by this much of the white marble's token (`NEON.whiteMarble`), so it reads 3:1 on the black sky and on the terrace's
 * background even for the Chapel's dark violet, and still tells its deck (the Mess excepted, below). */
export const PROP_LIGHT = 0.35;

/** The Mess's prop is dark instead, the black marble's token: its key and the white marble's token read pale on the Mess's pale ground (3:1 there, measured on the render). */
export const MESS_PROP = NEON.blackMarble;

/** The colour of a deck's prop. */
export const deckPropColour = (deck: Deck): THREE.Color =>
  deck === 'mess' ? new THREE.Color(MESS_PROP) : new THREE.Color(DECK_KEY[deck].key).lerp(new THREE.Color(NEON.whiteMarble), PROP_LIGHT);

/** Every prop is drawn at this share of the sizes above: the beams stay clear of the window's edge and of the HUD at the camera's distance. */
export const PROP_SCALE = 0.8;

const build = ({ shape, at, size: [w, h, d], top = 1 }: PropPart): THREE.BufferGeometry =>
  (shape === 'box' ? new THREE.BoxGeometry(w, h, d) : new THREE.CylinderGeometry((w / 2) * top, w / 2, h, 6).scale(1, 1, d / w)).translate(...at).scale(PROP_SCALE, PROP_SCALE, PROP_SCALE);

/** The box round a part, in the prop's own frame. */
export const partBox = (part: PropPart): THREE.Box3 => new THREE.Box3().setFromBufferAttribute(build(part).attributes.position as THREE.BufferAttribute);

const geometries = new Map<Deck, THREE.BufferGeometry>();
/** The one merged geometry of a deck's prop, built once. */
export function deckPropGeometry(deck: Deck): THREE.BufferGeometry {
  if (!geometries.has(deck)) geometries.set(deck, mergeGeometries(DECK_PROPS[deck].map(build), false));
  return geometries.get(deck)!;
}

/** Where the prop stands for a board of `radius` cells (4, the Ballast Mind's 5, The Dual Room's 7): out beyond the posts and the beacons (a pulsar stands 5.3 out), on the
 * side the window has room for. A desktop is wide, so the left side, level with the lower half of the board, under the goal panel; a phone is tall, so the near end under the board, off the middle to the left,
 * above the dock. Never the
 * south-east, the kit piece's quarter (bossprops.ts). The camera draws back with a larger board, so the spot goes out with it. */
export function deckPropSpot(radius: number, phone: boolean): { x: number; z: number } {
  const out = radius / 4;
  return phone ? { x: -1.8 * out, z: 6.6 * out } : { x: -6.1 * out, z: 1.8 * out };
}
