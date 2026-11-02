// The neon look (#1424): direction A "Circuit Slab" of the sci-fi mockups (art/mockups/neon), dark slate cells in dark gaps, neon on
// edges only. Colours, materials, light and sky: the same board, geometry, rules and camera. Off unless the address says `?look=neon`;
// it is never stored, so a player who did not ask for it never sees it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The approved numbers (mock/mock.js, directions.json). Neon is on edges, lines and lamps, never on a cell top. */
export const NEON = {
  sky: 0x04050c,
  cell: 0x5d6a82,
  gap: 0x0a0e18,
  /** The albedo of the gap floor: the hemisphere lights it up about three times, so it reads near `gap` on the screen. */
  gapFloor: 0x020307,
  /** The ground, lit about as it is painted: near the board and far from it, darker than a cell top and lighter than the rim. */
  ground: 0x1d2433,
  groundFar: 0x131824,
  plateau: 0x1d2433,
  rim: 0x0f1320,
  rimLight: 0x39466a,
  slab: 0x171c2b,
  cyan: 0x19e6ff,
  violet: 0x9a6bff,
  turn: 0x5fd0e6,
  crystal: 0x6a609f, // 30 % less saturated than the mockup's #7a62d8: never the loudest object
  pedestalRing: 0x7fd6e8,
  boulder: 0x2c2f36,
  blackMarble: 0x14161a,
  whiteMarble: 0xf2f0ea,
} as const;

/** The mock's light: a cold sun low on the left, a violet-tinted hemisphere, ACES at 1.15. */
export const NEON_LIGHT = { sun: 0xe8f0ff, sunIntensity: 3.2, elevation: 24, azimuth: 50, sky: 0x9a6bff, skyMix: 0xe8eeff, skyAmount: 1, ground: 0x2a3347, hemisphere: 2.9, exposure: 1 } as const;

/** `?look=neon`, nothing else. */
export function neonLookOn(search: string): boolean {
  return new URLSearchParams(search).get('look') === 'neon';
}

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const linear = (hex: number): THREE.Color => new THREE.Color(hex);

/** The sun and the hemisphere of the neon look. */
export function lightNeon(sun: THREE.DirectionalLight, hemisphere: THREE.HemisphereLight): void {
  const { elevation, azimuth } = NEON_LIGHT;
  const [el, az] = [(elevation * Math.PI) / 180, (azimuth * Math.PI) / 180];
  sun.color.set(NEON_LIGHT.sun);
  sun.intensity = NEON_LIGHT.sunIntensity;
  sun.position.set(-30 * Math.cos(el) * Math.sin(az), 30 * Math.sin(el), 30 * Math.cos(el) * Math.cos(az));
  hemisphere.color.copy(linear(NEON_LIGHT.sky).lerp(linear(NEON_LIGHT.skyMix), NEON_LIGHT.skyAmount));
  hemisphere.groundColor.copy(linear(NEON_LIGHT.ground));
  hemisphere.intensity = NEON_LIGHT.hemisphere;
}

/** Fine stars on a black sky: one draw call, a tiny triangle each facing the board, no haze (a Points sprite is not drawn by this renderer). */
export function neonStars(count = 1400): THREE.Mesh {
  const position = new Float32Array(count * 9);
  const colour = new Float32Array(count * 9);
  let s = 17;
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const [centre, up, side] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < count; i++) {
    const [az, y] = [rnd() * Math.PI * 2, 0.02 + rnd() * rnd() * 0.98]; // denser near the horizon, where the camera looks
    const r = Math.sqrt(1 - y * y);
    centre.set(Math.cos(az) * r, y, Math.sin(az) * r);
    side.set(-Math.sin(az), 0, Math.cos(az));
    up.crossVectors(centre, side);
    const size = 0.25 + rnd() * 0.25;
    centre.multiplyScalar(240);
    position.set([...centre.clone().addScaledVector(side, -size).toArray(), ...centre.clone().addScaledVector(side, size).toArray(), ...centre.clone().addScaledVector(up, size * 1.6).toArray()], i * 9);
    const k = 0.35 + rnd() * 0.65;
    for (let v = 0; v < 3; v++) colour.set([0.85 * k, 0.88 * k, k], i * 9 + v * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  const stars = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  stars.name = 'neon_stars';
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  return stars;
}

/** What the neon look leaves out of the arena file: the dome, clouds, haze, fog rings and the sun disc, the planet. The sky is black. */
export const NEON_HIDDEN = /^scene_(sky_|fogring|fogline)/;

type Paint = (g: THREE.BufferGeometry) => void;

function eachColour(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => THREE.Color): void {
  const c = g.attributes.color!;
  const v = new THREE.Vector3();
  for (let i = 0; i < c.count; i++) {
    const out = fn(v.set(c.getX(i), c.getY(i), c.getZ(i)));
    c.setXYZ(i, out.r, out.g, out.b);
  }
}

/** Keeps the file's light and shade (its bevels and baked occlusion), in `target` where the file was `ref`. */
const tone =
  (target: number, ref: number): Paint =>
  (g) => {
    const [t, r] = [linear(target), linear(ref)];
    const k = luma(r.r, r.g, r.b);
    eachColour(g, (v) => t.clone().multiplyScalar(luma(v.x, v.y, v.z) / k));
  };

/** The file's darkest colour becomes `dark`, its brightest `light`, the rest between. */
const ramp =
  (dark: number, light: number, lo: number, hi: number): Paint =>
  (g) => {
    const [d, l] = [linear(dark), linear(light)];
    const [a, b] = [linear(lo), linear(hi)].map((c) => luma(c.r, c.g, c.b)) as [number, number];
    eachColour(g, (v) => d.clone().lerp(l, THREE.MathUtils.clamp((luma(v.x, v.y, v.z) - a) / (b - a), 0, 1)));
  };

/** Like `tone`, with the colour going from `near` (round the board) to `far` (the plain), by distance from the board's centre. */
const distanceTone =
  (near: number, far: number, ref: number): Paint =>
  (g) => {
    const [a, b, r] = [linear(near), linear(far), linear(ref)];
    const k = luma(r.r, r.g, r.b);
    const p = g.attributes.position!;
    const c = g.attributes.color!;
    for (let i = 0; i < c.count; i++) {
      const t = THREE.MathUtils.clamp((Math.hypot(p.getX(i), p.getZ(i)) - 12) / 30, 0, 1);
      const out = a.clone().lerp(b, t).multiplyScalar(luma(c.getX(i), c.getY(i), c.getZ(i)) / k);
      c.setXYZ(i, out.r, out.g, out.b);
    }
  };

/** One flat colour, whatever the file had. */
const flatColour =
  (hex: number): Paint =>
  (g) => {
    const c = linear(hex);
    eachColour(g, () => c);
  };

/** The paint of each node of the arena file, by name (the means and extremes read from arena.glb). */
const RULES: [RegExp, Paint][] = [
  [/^scene_(cell|ballast_cell|dual_cell|dual_cell_n|hub_cell|royale_cell)_?\d+$/, tone(NEON.cell, 0xb3a98a)],
  [/^scene_(slab_arena|ballast_slab|dual_slab_[ns]|slab_hub|royale_slab)$/, ramp(NEON.gapFloor, NEON.rim, 0x2a3540, 0xa29e9a)],
  [/^scene_post/, ramp(NEON.slab, NEON.rimLight, 0x3b3b3d, 0xd8d4c8)],
  [/^scene_col_map_b/, distanceTone(NEON.ground, NEON.groundFar, 0x818d8d)],
  [/^scene_col_plateau/, distanceTone(NEON.plateau, NEON.groundFar, 0x746d59)],
  [/^scene_(cairn|crew)/, tone(NEON.boulder, 0x918f89)],
  [/^scene_outcrop/, tone(NEON.crystal, 0x38938b)],
  [/^scene_tower_body/, ramp(NEON.gapFloor, NEON.rim, 0x35383b, 0x797a78)],
  [/^scene_tower_lamp/, flatColour(NEON.violet)],
  [/^scene_wall_claim/, ramp(NEON.gap, NEON.rimLight, 0x000000, 0xd9d4c8)],
  [/^scene_ridge/, tone(0x131a28, 0x8ba1a9)],
  [/^scene_turnbar/, flatColour(NEON.turn)],
  [/^kit_pedestal/, flatColour(NEON.plateau)],
];

/** Repaints the geometry of the node `name` in place; a node the look does not know keeps its colours. */
export function neonPaint(name: string, geometry: THREE.BufferGeometry): void {
  RULES.find(([re]) => re.test(name))?.[1](geometry);
}

/** The lit materials: the glass of the cells, the slate of the rest; and the lamps, which no light touches. */
const lit = new Map<string, THREE.Material>();
export function neonMaterial(name: string): THREE.Material {
  const kind = /^scene_tower_lamp/.test(name) ? 'lamp' : /^scene_(cell|ballast_cell|dual_cell|hub_cell|royale_cell)/.test(name) || name === 'dish' ? 'glass' : /^scene_turnbar/.test(name) ? 'bar' : 'slate';
  if (!lit.has(kind)) {
    lit.set(
      kind,
      kind === 'lamp' || kind === 'bar'
        ? new THREE.MeshBasicMaterial({ name: `neon_${kind}`, vertexColors: true, fog: false, color: new THREE.Color().setScalar(kind === 'lamp' ? 2.2 : 0.8) })
        : new THREE.MeshStandardMaterial({ name: `neon_${kind}`, vertexColors: true, roughness: kind === 'glass' ? 0.42 : 0.7, metalness: 0.1 }),
    );
  }
  return lit.get(kind)!;
}

/** The thin cyan hexagon of a cell, drawn in its gap: the brightest line of the board. One instance per cell. */
export function neonEdgeGeometry(inner = 0.53, outer = 0.56, y = 0.07, turn = 0): THREE.BufferGeometry {
  const position: number[] = [];
  const at = (r: number, k: number): [number, number, number] => [Math.sin((k * Math.PI) / 3 + turn) * r, y, Math.cos((k * Math.PI) / 3 + turn) * r];
  for (let k = 0; k < 6; k++) position.push(...at(inner, k), ...at(outer, k), ...at(outer, k + 1), ...at(inner, k), ...at(outer, k + 1), ...at(inner, k + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  return g;
}

export const neonEdgeMaterial = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ name: 'neon_edge', color: new THREE.Color(NEON.cyan).multiplyScalar(1.4), fog: false, side: THREE.DoubleSide });

/** The kit's pedestal under a marble, in slate with a thin cyan ring on its rim (60 % cyan): a copy, the file's own stays as it is. */
export function neonPedestal(pedestal: THREE.Mesh): THREE.Mesh {
  const copy = pedestal.clone();
  const disc = pedestal.geometry.clone();
  const source = disc.attributes.color!;
  disc.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: source.count }, (_, i) => [source.getX(i), source.getY(i), source.getZ(i)]).flat(), 3)); // the file's may be 8 bit or have an alpha
  neonPaint(pedestal.name, disc);
  const ring = new THREE.RingGeometry(0.345, 0.37, 36).rotateX(-Math.PI / 2).translate(0, 0.1125, 0);
  const ringColour = linear(NEON.plateau).lerp(linear(NEON.pedestalRing), 0.6);
  ring.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: ring.attributes.position!.count }, () => ringColour.toArray()).flat(), 3));
  const parts = [disc, ring].map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(flat.attributes)) if (!['position', 'normal', 'color'].includes(name)) flat.deleteAttribute(name);
    return flat;
  });
  copy.geometry = mergeGeometries(parts, false);
  copy.material = neonMaterial('slate');
  return copy;
}

/** The violet channel along the inner top edge of the slab's rim (about 0.05 of a cell wide) and a glowing band and tip on each post, unlit at 1.2. */
export function neonGlow(posts: readonly THREE.Vector3[], rim: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'neon_glow';
  const violet = new THREE.MeshBasicMaterial({ name: 'neon_violet', color: new THREE.Color(NEON.violet).multiplyScalar(1.2), fog: false, side: THREE.DoubleSide });
  if (rim) group.add(new THREE.Mesh(neonEdgeGeometry(4.93, 4.98, 0.158, Math.PI / 6), violet)); // the rim's inner top edge (slab_arena: a flat-top hexagon of 4.9)
  for (const p of posts) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 8, 1, true), violet);
    band.position.set(p.x, p.y + 0.7, p.z);
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8).rotateX(-Math.PI / 2), violet);
    tip.position.set(p.x, p.y + 1.075, p.z);
    group.add(band, tip);
  }
  return group;
}
