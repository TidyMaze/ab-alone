// Table Zero, the terrace (#1314): the 1v1 arena of the approved Blender design. Palette, light and activation live here; the
// meshes come from the glTF of `3d-artist` (public/assets/pbr/arena.glb), never rebuilt in code. Art direction: art2/notes-round4.md.
import * as THREE from 'three';

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

/** One sun, elevation 22, 25 degrees left of the camera axis at yaw 0, fixed in the world; a hemisphere; no point light. */
export const SUN = { colour: 0xffd9a8, intensity: 2.6, elevation: 22, azimuth: 25, sky: 0x9db8d8, ground: 0x5a4636, hemisphere: 1.1 } as const;

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
