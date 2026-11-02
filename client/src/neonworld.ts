// The neon look of the Open world (#1424, `?look=neon`): the ground, props, lairs and marbles of the circuit slab, from the approved
// numbers of the mockup (mock.js, buildWorld). Colours, materials, light and sky only: the geometry, the camera and the draw count
// are the game's. The palette changes the very constants the 3D view and the minimap read, so the map follows it.
import * as THREE from 'three';
import { NEON, setNeonWorldOn } from './neonlook';

/** The three ground tones of the three biomes (the mockup's `tones`): the meadow, the mesa and the rock. */
export const WORLD = { meadow: 0x2f3b52, mesa: 0x3d3750, rock: 0x1f2634, shore: 0x234a66, deep: 0x142b44, wall: 0x171c2b, boulder: 0x2c3138, mountain: 0x2a3347 } as const;
/** The ambient motes of the Open world: a dim cool grey-blue. */
const MOTE = 0x5a7090;
/** The soft shadows of the Open world under the look: about 55 % dark, so the darkest floor stays above #0f1424. */
export const WORLD_SHADOW = 0.55;

type Colours = Record<string, number>;
/** The palette objects the view and the minimap hold (openworldview.ts), handed in so this file needs no import of the view. */
export interface WorldPalette {
  LOOK: Record<string, { color: number; emissive: number }>;
  WATER: Colours;
  BIOME_LOOK: Record<string, { ground: number; prop: number }>;
  PROPS: Record<string, { color: number; emissive: number }>;
  MARBLE_LOOK: Record<string, { base: number; stripe: number; roughness: number }>;
  LAIR_LOOK: { open: number; beaten: number; height: number };
  TELEPORTER_LOOK: { colour: number; ring: number };
  /** The ambient motes of each biome: only their colour is the look's. */
  AMBIENT: Partial<Record<string, { colour: number }>>;
}

const snapshot = new WeakMap<WorldPalette['LOOK'], string>();

/** Puts the palette on, or gives the game's own back (what was there when it was first put on). */
export function applyNeonWorld(on: boolean, p: WorldPalette): void {
  // Only the colours are copied and written back: a prop's geometry stays the view's own.
  const colours = (props: WorldPalette['PROPS']): WorldPalette['PROPS'] => Object.fromEntries(Object.entries(props).map(([name, { color, emissive }]) => [name, { color, emissive }]));
  const motes = (a: WorldPalette['AMBIENT']): WorldPalette['AMBIENT'] => Object.fromEntries(Object.entries(a).map(([name, look]) => [name, { colour: look!.colour }]));
  if (!snapshot.has(p.LOOK)) snapshot.set(p.LOOK, JSON.stringify({ ...p, PROPS: colours(p.PROPS), AMBIENT: motes(p.AMBIENT) }));
  const base = JSON.parse(snapshot.get(p.LOOK)!) as WorldPalette;
  setNeonWorldOn(on);
  const from = on ? neonPalette(base) : base;
  for (const k of ['LOOK', 'BIOME_LOOK', 'PROPS', 'MARBLE_LOOK'] as const) for (const [name, value] of Object.entries(from[k])) Object.assign(p[k][name]!, value);
  for (const [name, look] of Object.entries(from.AMBIENT)) Object.assign(p.AMBIENT[name]!, look);
  Object.assign(p.WATER, from.WATER);
  Object.assign(p.LAIR_LOOK, from.LAIR_LOOK);
  Object.assign(p.TELEPORTER_LOOK, from.TELEPORTER_LOOK);
}

/** The game's palette with the neon one on top. */
function neonPalette(base: WorldPalette): WorldPalette {
  const out = JSON.parse(JSON.stringify(base)) as WorldPalette;
  Object.assign(out.LOOK.sand!, { color: WORLD.mesa });
  Object.assign(out.LOOK.grass!, { color: WORLD.meadow });
  Object.assign(out.LOOK.rock!, { color: WORLD.rock });
  Object.assign(out.LOOK.peak!, { color: WORLD.rock });
  out.WATER = { shore: WORLD.shore, deep: WORLD.deep };
  for (const [biome, ground] of Object.entries({ meadow: WORLD.meadow, forest: WORLD.meadow, tundra: WORLD.meadow, desert: WORLD.mesa, badlands: WORLD.mesa })) out.BIOME_LOOK[biome] = { ground, prop: 0xffffff };
  Object.assign(out.PROPS.mountain!, { color: WORLD.mountain, emissive: 0 });
  Object.assign(out.PROPS.tree!, { color: NEON.crystal, emissive: 0 }); // calm: the quietest violet of the map
  Object.assign(out.PROPS.boulder!, { color: WORLD.boulder, emissive: 0 }); // no neon on a boulder
  Object.assign(out.PROPS.wall!, { color: WORLD.wall, emissive: 0 }); // the cap keeps the sodium seam
  Object.assign(out.MARBLE_LOOK.hero!, { base: NEON.whiteMarble, stripe: NEON.pedestalRing });
  Object.assign(out.MARBLE_LOOK.troop!, { base: 0xdfe8f5, stripe: NEON.pedestalRing });
  Object.assign(out.MARBLE_LOOK.foes!, { base: NEON.blackMarble });
  Object.assign(out.LAIR_LOOK, { open: NEON.violet, beaten: NEON.cyan });
  Object.assign(out.TELEPORTER_LOOK, { colour: NEON.crystal }); // a pad is quieter than a marble
  for (const look of Object.values(out.AMBIENT)) look!.colour = MOTE; // calm motes: a cool slate, never a bright colour on the map
  return out;
}

/** The map is read on the ship's black, not in the 3D light: the dark terrain of the look is lifted (x6 in linear light) so the darkest, the rock, stays 3:1 over the map's back. */
export const MAP_LIFT = 6;
export function mapColour(hex: number): number {
  const c = new THREE.Color(hex);
  c.setRGB(Math.min(1, c.r * MAP_LIFT), Math.min(1, c.g * MAP_LIFT), Math.min(1, c.b * MAP_LIFT));
  return c.getHex();
}

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const linear = (hex: number): THREE.Color => new THREE.Color(hex);

/** A copy of `geometry` with float RGB vertex colours, each given by `paint` from its file colour and its place between the file's darkest and brightest. */
function repaint(geometry: THREE.BufferGeometry, paint: (c: THREE.Color, t: number) => THREE.Color): THREE.BufferGeometry {
  const out = geometry.clone();
  const src = out.attributes.color!;
  const values = Array.from({ length: src.count }, (_, i) => new THREE.Color(src.getX(i), src.getY(i), src.getZ(i)));
  const lights = values.map((c) => luma(c.r, c.g, c.b));
  const [lo, hi] = [Math.min(...lights), Math.max(...lights)];
  out.setAttribute('color', new THREE.Float32BufferAttribute(values.flatMap((c, i) => paint(c, hi === lo ? 1 : (lights[i]! - lo) / (hi - lo)).toArray()), 3));
  return out;
}

const between = (dark: number, light: number, t: number): THREE.Color => linear(dark).lerp(linear(light), t);

/** The model of a prop in the neon look: the file's light and shade in slate, the tree a calm violet crystal, the wall's sodium seam and the lair's lamp kept as lamps. */
export function neonProp(prop: string, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.hasAttribute('color')) return geometry;
  if (prop === 'mountain') return repaint(geometry, (_, t) => between(0x1b2233, 0x3a4560, t));
  if (prop === 'tree') return repaint(geometry, (_, t) => between(0x2b2650, NEON.crystal, t));
  if (prop === 'wall') return repaint(geometry, (c, t) => (t > 0.5 ? c : between(0x0f1320, 0x2a3347, t * 2)));
  const gem = prop === 'lair_beaten' ? NEON.cyan : NEON.violet; // the lair's lamp: lit more than the slate it stands on
  return repaint(geometry, (_, t) => (t > 0.55 ? linear(gem).multiplyScalar(1.6) : between(0x0f1320, 0x2a3347, t / 0.55)));
}
