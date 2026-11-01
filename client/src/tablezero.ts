// Table Zero, the terrace (#1314): the 1v1 arena of the approved Blender design. Palette, light and activation live here; the
// meshes come from the glTF of `3d-artist` (public/assets/pbr/arena.glb), never rebuilt in code. Art direction: art2/notes-round4.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The palette the port must match (notes-round4.md). */
export const PALETTE = {
  dish: 0xb4aa81,
  pedestalTop: 0xc9bf9c,
  pedestalSide: 0x8d845f,
  gap: 0x2c3438,
  rim: 0x4b4f55,
  plateau: 0x6a7077,
  cyan: 0x7fd6e8, // the turn bar
  sodium: 0xd9822b, // the last move's edge
  bone: 0xd8d4c8,
  whiteMarble: 0xd4cdb9,
  whiteUnderside: 0x9db8c4,
  /** The soft tone clamp of a white marble's brightest pixel (notes-batchA2.md). */
  whiteClamp: 0xe8e4d6,
  ridges: [0x2c5a63, 0x4a7480, 0x7f9fac],
} as const;

/** One sun, elevation 28 (the Blender render's, lights_camera.json), 25 degrees left of the camera axis at yaw 0, fixed in the world; a hemisphere; no point light. */
export const SUN = { colour: 0xffd9a8, intensity: 4.6, elevation: 28, azimuth: 25, sky: 0x9db8d8, ground: 0x8a7a66, hemisphere: 1.9 } as const;

/** The sun's position on a sphere of `distance` round the board: x is left of the axis, the camera looks from +z at yaw 0. */
export function sunPosition(distance = 30): [number, number, number] {
  const [el, az] = [(SUN.elevation * Math.PI) / 180, (SUN.azimuth * Math.PI) / 180];
  return [-distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

/** Adds the sun and the hemisphere to `group`; both are returned. */
export function addSun(group: THREE.Object3D): [THREE.HemisphereLight, THREE.DirectionalLight] {
  const hemisphere = new THREE.HemisphereLight(SUN.sky, SUN.ground, SUN.hemisphere);
  const sun = new THREE.DirectionalLight(SUN.colour, SUN.intensity);
  sun.position.set(...sunPosition());
  group.add(hemisphere, sun);
  return [hemisphere, sun];
}

/**
 * The 1v1 default scene. The hub, the boss rooms, the battle royale and a roguelite run keep the room until their own PRs, and
 * so does `?scene=room` (the fallback), and so does a page whose arena file has not loaded (`ready`).
 */
export function tableZeroActive(s: { hub: boolean; fight: boolean; royale: boolean; run: boolean; room: boolean; ready: boolean }): boolean {
  return s.ready && !(s.hub || s.fight || s.royale || s.run || s.room);
}

/** What the game draws itself, from its own state: marbles, pedestals, rings and arrows are left out of the arena file. */
const GAME_DRAWN = /^scene_(marble|pedestal|ring|arrow|shadow)/;
/** The turn bars stay meshes of their own: the game lights the one of the side to move. */
const TURN_BAR = /^scene_turnbar/;

const unlit = new Map<boolean, THREE.MeshBasicMaterial>();
/**
 * The unlit materials of the file (sky, lamps, bars, haze, shadow): Blender emits their colour from COLOR_0, glTF gives them a white
 * emissive factor over a black base, so three would draw them white. The loader also folds them into one material (they differ by
 * name only), so what tells them apart is the geometry: a mesh with a vertex below full alpha is blended, any other is solid.
 */
export function terraceMaterial(material: THREE.Material, geometry: THREE.BufferGeometry): THREE.Material {
  if ((material as THREE.MeshStandardMaterial).emissive?.getHex() !== 0xffffff) return material;
  const colour = geometry.attributes.color;
  let blended = false;
  for (let i = 0; colour && colour.itemSize === 4 && i < colour.count && !blended; i++) blended = colour.getW(i) < 0.999;
  if (!unlit.has(blended)) unlit.set(blended, new THREE.MeshBasicMaterial({ name: blended ? 'terrace_blended' : 'terrace_solid', vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: blended }));
  return unlit.get(blended)!;
}

/**
 * The arena file has 1,489 nodes: drawn as they are, that is 1,000 calls. This bakes every static node into the world, then
 * draws one mesh per material (5 calls), the turn bars apart. Blended materials draw last and write no depth.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const bars: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || GAME_DRAWN.test(o.name)) return;
    if (TURN_BAR.test(o.name)) return void bars.push(mesh);
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    g.deleteAttribute('uv');
    const material = terraceMaterial(mesh.material as THREE.Material, mesh.geometry);
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), g]);
  });
  const out = new THREE.Group();
  for (const [material, geometries] of byMaterial) {
    const blended = material.transparent;
    if (blended) material.depthWrite = false;
    const merged = new THREE.Mesh(mergeGeometries(geometries, false), material);
    merged.frustumCulled = false; // the arena is always in view
    merged.renderOrder = blended ? 1 : 0;
    out.add(merged);
  }
  for (const bar of bars) {
    bar.material = terraceMaterial(bar.material as THREE.Material, bar.geometry);
    bar.matrix.copy(bar.matrixWorld).decompose(bar.position, bar.quaternion, bar.scale);
    out.add(bar);
  }
  return out;
}
