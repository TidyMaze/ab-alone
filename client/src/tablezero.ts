// Table Zero (#1314) and the shared kit of the arena and the Open world (#1315): one palette, one sun, a few vertex-colour
// meshes, no texture. Art direction: the comment of issue #1314. The Open world imports `addSun` for its light, so the
// room and the map are lit by the same sun.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The eight colours of the direction. Marble skins, water, tundra and danger red keep their own tokens. */
export const PALETTE = {
  hollow: 0x0b0d0f, // sky, void, HUD plate
  slate: 0x4b4f55, // arena rim, rock, wall base
  moss: 0x446957, // meadow and forest ground
  dust: 0x877d65, // arena cells, sand
  teal: 0x2fb5a0, // slag-glass outcrops
  cyan: 0x7fd6e8, // the player's light
  sodium: 0xd9822b, // last move, wall cap, open tower
  bone: 0xd8d4c8, // selection, tally ticks, stakes
} as const;

/** The Open world's own light: a warm sun from the upper left over a hemisphere, no point light, no emissive. */
export const SUN = { sky: 0xcfe0ff, ground: 0x2a2418, hemisphere: 1.6, sun: 0xfff1d6, intensity: 2.2, at: [-6, 12, 4] } as const;

/** Adds the sun and the hemisphere to `scene`; both are returned, to move or hide them. */
export function addSun(scene: THREE.Object3D): [THREE.HemisphereLight, THREE.DirectionalLight] {
  const hemisphere = new THREE.HemisphereLight(SUN.sky, SUN.ground, SUN.hemisphere);
  const sun = new THREE.DirectionalLight(SUN.sun, SUN.intensity);
  sun.position.set(...SUN.at);
  scene.add(hemisphere, sun);
  return [hemisphere, sun];
}

/** What Table Zero replaces: the 1v1 default scene. The hub, the boss rooms, the battle royale and a roguelite run keep the room. */
export function tableZeroActive(s: { hub: boolean; fight: boolean; royale: boolean; run: boolean }): boolean {
  return !(s.hub || s.fight || s.royale || s.run);
}

const paint = (g: THREE.BufferGeometry, color: number): THREE.BufferGeometry => {
  const c = new THREE.Color(color);
  const n = g.attributes.position!.count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
};

/** The hex prism of the kit (cells, ground, wall and tower segments): 24 triangles, one colour per vertex, base at y 0. */
export function hexPrism(radius: number, height: number, color: number): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(radius, radius, height, 6).translate(0, height / 2, 0), color);
}

/** The cell of Table Zero: a twelve-sided disc, 48 triangles, its top Dust and its sides and base a dark Slate, so the edge reads against the plate. */
export function cellGeometry(radius: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, 0.1, 12);
  const [up, down] = [new THREE.Color(PALETTE.dust), new THREE.Color(0x1f2125)];
  const normal = g.attributes.normal!;
  const rgb = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const c = normal.getY(i) > 0.5 ? up : down;
    rgb.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}

export interface Column {
  x: number;
  z: number;
  height: number;
  color: number;
}

const SKYLINE = [1.2, 2.4, 1.6, 3.4, 2.0, 1.0, 2.8, 4.2, 2.2, 1.4, 3.0, 1.8, 2.6]; // heights of the map seen through the window
const GROUND = [PALETTE.moss, PALETTE.dust, PALETTE.slate, PALETTE.moss, PALETTE.teal];

/** The Open world seen through the window: stepped hex columns in a row, Moss, Dust, Slate and Teal. No random: the same each time. */
export function windowStrip(): Column[] {
  return SKYLINE.map((height, i) => ({ x: (i - (SKYLINE.length - 1) / 2) * 1.5, z: i % 2 === 0 ? 0 : 0.9, height, color: GROUND[i % GROUND.length]! }));
}

/** The strip as one geometry (a draw call): each column is its sides and its top, 18 triangles, no base. */
export function windowStripGeometry(): THREE.BufferGeometry {
  const parts = windowStrip().map((c) => {
    const g = hexPrism(0.8, c.height, c.color).translate(c.x, 0, c.z);
    g.setIndex(Array.from(g.index!.array).slice(0, 18 * 3)); // sides and top: the base is under the sill
    return g;
  });
  return mergeGeometries(parts)!;
}
