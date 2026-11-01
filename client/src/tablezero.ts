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

/** AgX, the Blender render's own view transform, at the exposure that lands the dish near #b6ab82 and the gap on #2d3539. */
export const TERRACE_EXPOSURE = 1.5;

/** One sun, elevation 28 (the Blender render's, lights_camera.json), 25 degrees left of the camera axis at yaw 0, fixed in the world; a hemisphere; no point light. */
export const SUN = { colour: 0xffd9a8, intensity: 4.6, elevation: 28, azimuth: 25, sky: 0x9db8d8, ground: 0x8a7a66, hemisphere: 1.9 } as const;

/** The sun's position on a sphere of `distance` round the board: x is left of the axis, the camera looks from +z at yaw 0. */
export function sunPosition(distance = 30): [number, number, number] {
  const [el, az] = [(SUN.elevation * Math.PI) / 180, (SUN.azimuth * Math.PI) / 180];
  return [-distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

/**
 * The sun's soft shadow (#1364), the render's: a 2048 map over the board and two rings round it (7 cells each way: the far ring and the ridges stay unshaded), very soft and light (the art director's values).
 * The posts, the walls, the plinth and its steps cast it, not the marbles (their pedestal is their contact); the baked ambient occlusion of the vertex colours stays under it.
 */
export const SUN_SHADOW = { size: 1024, extent: 7, near: 1, far: 90, bias: -0.0005, normalBias: 0.04, radius: 9, blurSamples: 8, intensity: 0.3 } as const;

/** Sets the sun's shadow camera and map, on or off (the low tier draws none). */
export function aimSunShadow(sun: THREE.DirectionalLight, on: boolean, reach: number = SUN_SHADOW.extent): void {
  sun.castShadow = on;
  if (!on) return;
  const { size, near, far, bias, normalBias, radius, blurSamples, intensity } = SUN_SHADOW;
  const extent = reach;
  sun.shadow.mapSize.set(size, size);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near, far });
  sun.shadow.camera.updateProjectionMatrix();
  Object.assign(sun.shadow, { bias, normalBias, radius, blurSamples, intensity });
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
  if (!unlit.has(blended)) unlit.set(blended, new THREE.MeshBasicMaterial({ name: blended ? 'terrace_blended' : 'terrace_solid', vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: blended, color: new THREE.Color().setScalar(1 / TERRACE_EXPOSURE) }));
  // the exposure lights the lit meshes up; an unlit colour is the render's own, so it is scaled back down by it
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
    if (o.name === 'scene_sky_dome') {
      saturateColours(g, SKY_SATURATION, -Infinity, ZENITH_FROM); // the horizon band
      saturateColours(g, ZENITH_SATURATION, ZENITH_FROM, Infinity); // the zenith
    }
    if (o.name === 'scene_slab_arena') saturateColours(g, RIM_SATURATION); // the rim and the plinth read brown against Blender's grey-taupe
    const material = terraceMaterial(mesh.material as THREE.Material, mesh.geometry);
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), g]);
  });
  const out = new THREE.Group();
  for (const [material, geometries] of byMaterial) {
    const blended = material.transparent;
    if (blended) material.depthWrite = false;
    else if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) (material as THREE.MeshStandardMaterial).color.multiply(TERRACE_TINT);
    const merged = new THREE.Mesh(mergeGeometries(geometries, false), material);
    merged.frustumCulled = false; // the arena is always in view
    merged.castShadow = merged.receiveShadow = (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true; // the lit board: posts, plinth and plateau shade each other (#1364)
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

/** The terrace's default camera, the Blender brief's: pitch 57 (33 from the vertical), 13.6 away, fov 40 as the game's. */
export const TERRACE_VIEW = { azimuth: 0, polar: (33 * Math.PI) / 180, distance: 13.6 } as const;

/** Whether a view is the game's default one, which the terrace replaces by its own and nothing else. */
export function isDefaultView(v: { azimuth: number; polar: number; distance: number }, reset: { azimuth: number; polar: number; distance: number }): boolean {
  return v.azimuth === reset.azimuth && Math.abs(v.polar - reset.polar) < 1e-6 && Math.abs(v.distance - reset.distance) < 1e-6;
}

/**
 * What the black marbles reflect (the room's lamps are gone): a sky ramp from the teal zenith to the orange band, a small white
 * window high on the left, a faint cyan strip low on the right. No sun disc: it made a warm blotch low on every marble.
 */
export function terraceEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const ramp = new THREE.SphereGeometry(50, 24, 16);
  const [top, horizon, band, ground] = [0x35676f, 0x9db8c4, 0xe8a870, 0x5a4636].map((c) => new THREE.Color(c)) as [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  const n = ramp.attributes.position!.count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = ramp.attributes.position!.getY(i) / 50;
    const c = y > 0.25 ? top.clone().lerp(horizon, 1 - (y - 0.25) / 0.75) : y > 0 ? horizon.clone().lerp(band, 1 - y / 0.25) : band.clone().lerp(ground, Math.min(1, -y * 4));
    rgb.set([c.r, c.g, c.b], i * 3);
  }
  ramp.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  env.add(new THREE.Mesh(ramp, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const window = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 7.5), side: THREE.DoubleSide }));
  window.position.set(-20, 24, -28);
  window.lookAt(0, 0, 0);
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(40, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.1), side: THREE.DoubleSide }));
  rim.position.set(30, 6, -25);
  rim.lookAt(0, 0, 0);
  env.add(window, rim);
  return env;
}

/** The lit material is multiplied by this: AgX leans the dish pink and the plateau tan; a little green puts the Moss and the dish back (art director). */
export const TERRACE_TINT = new THREE.Color(0.965, 1.08, 0.96);
/** The horizon band of the sky dome, 30 percent more saturated (art director): the dome's own vertex colours. */
export const SKY_SATURATION = 1.3;
/** Above this height the dome is the zenith: 20 percent less saturated, the teal read too cyan (art director). */
const ZENITH_FROM = 20;
const ZENITH_SATURATION = 0.8;
/** The slab (rim, plinth steps): 25 percent less saturated (art director). */
const RIM_SATURATION = 0.75;

/** Pushes the colours of a geometry away from their grey by `k` (1 leaves them), for the vertices whose height is in [`from`, `to`). */
export function saturateColours(geometry: THREE.BufferGeometry, k: number, from = -Infinity, to = Infinity): void {
  const colour = geometry.attributes.color!;
  for (let i = 0; i < colour.count; i++) {
    const y = geometry.attributes.position!.getY(i);
    if (y < from || y >= to) continue;
    const grey = 0.2126 * colour.getX(i) + 0.7152 * colour.getY(i) + 0.0722 * colour.getZ(i);
    colour.setXYZ(i, Math.max(0, grey + (colour.getX(i) - grey) * k), Math.max(0, grey + (colour.getY(i) - grey) * k), Math.max(0, grey + (colour.getZ(i) - grey) * k));
  }
}
