// The Open world on screen (docs/specs/openworld.md section 2): the chunks around the hero drawn as columns of hex
// prisms, lifted by their height and coloured by their terrain, with low-poly props on top (faceted mountains, wire
// pines, boulders, gantry walls with a gold edge), the hero marble, and the camera that follows it. It has its own
// scene, drawn by the page's renderer while the mode is on. Relief and terrain are looks only.
import { addSun } from './tablezero';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { type Biome, CHUNK, cellAtPoint, chunkOf, neighbours, same, TROOP, type Terrain, type Tile, type World } from './openworld';
import { CameraLife } from './openworldcamera';
import { EDGE_GAIN, edgeMaterial, HEX_RADIUS } from './openworldedge';
import { FightState, type Pushed } from './openworldfight';
import { Marble, type Pace, ROLL_ZOOM, slowBy, TROOP_DELAY, type Vec } from './openworldglide';
import { FOAM_GAIN, motionUniforms, RIPPLE_MS, RipplePool, shimmerPosition, swayPosition, waterEmissive, writeRipples } from './openworldmotion';
import { AMBIENT, capFor, ParticlePool } from './openworldparticles';
import { type MarbleSkins, stripedMaterial, stripeFadeNode, stripeStrength } from './openworldstripe';

/** The most chunks loaded on each side of the hero's chunk, at the widest zoom: the instanced meshes hold all of them (#976).
 * Raised or lowered by measure (the rebuild time, the frame time, the memory), never by dropping detail. Ten covers the
 * widest zoom of a 16:9 screen (`MAX_ZOOM`); the instanced meshes hold 441 chunks, about 113k instances each. */
export const MAX_REACH = 10;
/** The most instances a mesh can need: one per cell of the widest view (21 x 21 chunks). A mesh grows up to it and never past. */
export const MOST = (2 * MAX_REACH + 1) ** 2 * CHUNK * CHUNK;
/** The instances each mesh holds at rest. Measured over 301 seeds at `MAX_REACH`: the most cells of each kind in the widest
 * window, plus a quarter, rounded up to a hundred. A mesh that a build needs bigger grows (`fit`), up to `MOST` (#1010). */
export const CAPACITY = {
  water: 26400,
  sand: 21100,
  grass: 66200,
  rock: 23000,
  peak: 37200,
  mountain: 37200,
  tree: 15700,
  boulder: 5300,
  wall: 500,
  cap: 500,
  enemies: 700,
  troop: TROOP,
} as const;

/** The chunks to load on each side of the hero's chunk for a ground radius of `radius` cells (a hex distance, see
 * `groundRadius`): the radius in chunks, rounded up, plus one chunk of margin for a hero standing at a chunk corner. Every
 * cell of the ground in view then lies in the loaded square, so the edge of the loaded area is never on screen (#976). */
export const reachFor = (radius: number): number => Math.ceil(radius / CHUNK) + 1;

/** Whether the square of `reach` chunks around the chunk `centre` covers every cell of the hex ball of `radius` cells around
 * `hero`: the ball's box lies in the square (a chunk is a 16 x 16 block of the axial grid). The ground in view lies in that ball
 * (`groundRadius`), so a square that covers the ball shows no edge (#1046). */
const covers = (centre: Axial, reach: number, hero: Axial, radius: number): boolean =>
  [0, 1].every((i) => hero[i]! - radius >= (centre[i]! - reach) * CHUNK && hero[i]! + radius < (centre[i]! + reach + 1) * CHUNK);

/** The four corners of the screen cast on the ground plane (y = 0): the ground the camera sees is the quadrilateral between
 * them. A corner that looks past the horizon gets a point far away on its ray, so the footprint is always four points. */
export function footprint(camera: THREE.Camera): THREE.Vector3[] {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const point = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, point)) ray.ray.at(SKY_DISTANCE, point);
    return point;
  });
}
/** How far along a ray a corner that sees no ground reaches: far past any reach, so it is clipped by `MAX_REACH`. */
const SKY_DISTANCE = 1e4;

/** The hex distance in cells between two cells: the steps a marble takes from one to the other. */
const hexDistance = ([q1, r1]: Axial, [q2, r2]: Axial): number => {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
};

/** The farthest ground the camera sees, in cells from the hero's cell at `at`: the hex distance of the cell of each corner of
 * the footprint, the largest of the four. */
export function groundRadius(camera: THREE.Camera, at: THREE.Vector3): number {
  const hero = cellAtPoint(at.x, at.z);
  return Math.max(...footprint(camera).map((p) => hexDistance(cellAtPoint(p.x, p.z), hero)));
}
/** The closest camera: up and back from the hero. The zoom multiplies both, the distance from the hero with them. */
const CAMERA_UP = 14;
const CAMERA_BACK = 11;
const CAMERA_DISTANCE = Math.hypot(CAMERA_UP, CAMERA_BACK);
/** The tilt of the camera from straight down, at the closest view. */
const TILT = Math.atan2(CAMERA_BACK, CAMERA_UP);
/** The fog starts at the hero's depth, the middle of the ground in view, and ends this factor past the depth of the farthest
 * corner of the footprint: it only softens the far horizon, the loaded edge lies outside the footprint (#976). */
const FOG_BEYOND = 1.3;
const CAMERA_FAR = 80;
const NEAR = 0.1;
/** The widest zoom of the camera for a 16:9 screen: the zoom where the reach of the loaded chunks reaches `MAX_REACH` (#976).
 * A wider screen has a lower one (`maxZoomFor`). Measured in headed Chromium on a 1280x720 screen: a warm rebuild takes at
 * most 18 ms (a chunk crossing about 16 ms) and the hero rolls at 60 FPS; a zoom where the reach is 13 takes 35 ms and runs
 * at 57 FPS, so it is too far. */
export const MAX_ZOOM = 6;

/** An angle in radians turned into (-pi, pi]: the shortest turn of the camera around the hero (#1026). */
export const wrapPi = (angle: number): number => {
  const turn = ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return turn === -Math.PI ? Math.PI : turn;
};

/** Puts the camera `k` zooms up and back from `at` (the point it looks at, the hero's column top when eased), turned `yaw` radians
 * round it (0 is the back at +z, as before #1026), looking down at it, and the planes of the camera with the zoom. */
function lookAtHero(camera: THREE.PerspectiveCamera, at: THREE.Vector3, k: number, yaw = 0): void {
  const distance = CAMERA_DISTANCE * k;
  const back = distance * Math.sin(TILT); // the horizontal part of the offset: the camera stands behind the hero, on the yaw's side
  camera.position.set(at.x + back * Math.sin(yaw), at.y + distance * Math.cos(TILT), at.z + back * Math.cos(yaw));
  camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); // screen up is the far side: the default up at the closest view, defined straight down
  camera.lookAt(at);
  camera.near = NEAR * k; // scales with the zoom: the depth precision is the same at every zoom
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** The reach of the loaded chunks at the zoom `k` and the yaw on a screen of `aspect`: the hero is the centre, so its cell is the origin. */
export function reachAt(aspect: number, k: number, yaw = 0): number {
  const probe = new THREE.PerspectiveCamera(40, aspect, NEAR, CAMERA_FAR);
  const origin = new THREE.Vector3();
  lookAtHero(probe, origin, k, yaw);
  return reachFor(groundRadius(probe, origin));
}

/** The farthest zoom a screen may go to: a portrait phone sees little ground at `MAX_ZOOM`, so it zooms out until its reach
 * reaches `MAX_REACH` (#1027). */
const ZOOM_CAP = 40;

/** The largest zoom in `[low, high]` whose reach at `yaw` stays within `MAX_REACH`, by bisection: `low` must fit, the reach grows
 * with the zoom. */
function widestFit(aspect: number, yaw: number, low: number, high: number): number {
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (reachAt(aspect, mid, yaw) <= MAX_REACH) low = mid;
    else high = mid;
  }
  return low;
}

/** The yaws the widest zoom is checked at, every degree: the camera turns all round the hero (#1026). A window of a few hundredths of
 * a degree, where a cell's corner crosses a cell edge, can still pass MAX_REACH: each frame draws less zoom there (`fitZoom`). */
const YAWS = Array.from({ length: 360 }, (_, i) => (i * Math.PI) / 180);
/** The widest zoom per aspect: a resize that keeps the aspect does not check the turns again. */
const limitOf = new Map<number, number>();

/** The largest zoom at `yaw` on a screen of `aspect` whose reach stays within `MAX_REACH`: a wide screen (its reach at `MAX_ZOOM`
 * over the budget) stops sooner, a portrait one goes out further (#1027), a 16:9 one keeps `MAX_ZOOM` where its reach is the budget. */
function zoomAt(aspect: number, yaw: number): number {
  const reach = reachAt(aspect, MAX_ZOOM, yaw);
  if (reach < MAX_REACH) return widestFit(aspect, yaw, MAX_ZOOM, ZOOM_CAP);
  if (reach === MAX_REACH) return MAX_ZOOM;
  return widestFit(aspect, yaw, 1, MAX_ZOOM);
}

/** The largest zoom on a screen of `aspect` whose reach stays within `MAX_REACH` at every yaw of the camera (#1026): the smallest
 * of `zoomAt` over `YAWS`. The zoom never goes past it, so the loaded chunks always cover the ground in view, at any turn (#976). */
export function maxZoomFor(aspect: number): number {
  let limit = limitOf.get(aspect);
  if (limit === undefined) {
    limit = Math.min(...YAWS.map((yaw) => zoomAt(aspect, yaw)));
    limitOf.set(aspect, limit);
  }
  return limit;
}

/** A copy of the hexagonal prism `prism` with its top face only (#1234): the 6 triangles of the top cap of a `CylinderGeometry`. */
function topOnly(prism: THREE.CylinderGeometry): THREE.BufferGeometry {
  const top = prism.groups[1]!; // the groups of a cylinder: the sides, the top cap, the bottom cap
  const flat = prism.clone();
  flat.clearGroups();
  flat.setIndex(Array.from(prism.index!.array.slice(top.start, top.start + top.count)));
  return flat;
}

/** The ground columns: one instanced mesh each. A blocked terrain stands on the ground of its `GROUND` entry. */
export const GROUNDS = ['water', 'sand', 'grass', 'rock', 'peak'] as const;
type Ground = (typeof GROUNDS)[number];
export const GROUND: Record<Terrain, Ground> = {
  water: 'water',
  sand: 'sand',
  grass: 'grass',
  rock: 'rock',
  peak: 'peak',
  boulder: 'rock',
  tree: 'grass',
  wall: 'rock',
};
/** The ship's black (`--bg`) the fog and the sky fade to, and the ship's one hazard colour, sodium (`--hazard`), on the wall edges (#1173). */
export const SHIP_BLACK = 0x0b0d0f;
export const SODIUM = 0xd9822b;
export const LOOK: Record<Ground, { color: number; emissive: number }> = {
  water: { color: 0xffffff, emissive: 0x052a34 }, // coolant lakes glow a little; the colour comes per cell (waterColor)
  sand: { color: 0x877d65, emissive: 0x000000 },
  grass: { color: 0x446957, emissive: 0x000000 },
  rock: { color: 0x4b4f55, emissive: 0x000000 },
  peak: { color: 0x474c52, emissive: 0x000000 },
};
/** The lake colours: the shore, lighter and greener, and the deep middle of a lake. */
export const WATER = { shore: 0x5392a5, deep: 0x2a516e };
/** The looks of the biomes (openworld-terrain.md section 4): the ground of the low grass (heights 3 and 4), and the tint of the
 * trees and the boulders, multiplied into their colour per instance. The meadow keeps the grass of `LOOK`; the rest is neutral
 * white. Shore, uplands, peaks and water keep their colours in every biome. */
export const BIOME_LOOK: Record<Biome, { ground: number; prop: number }> = {
  meadow: { ground: 0x446957, prop: 0xffffff },
  forest: { ground: 0x345846, prop: 0xffffff },
  tundra: { ground: 0xc4d0d8, prop: 0xdde8ee },
  desert: { ground: 0xaa9469, prop: 0xf0d4ae },
  badlands: { ground: 0x643d35, prop: 0xe8aa90 },
};
/** The colour of a cell's ground, per instance: the low grass by its biome, every other ground by `LOOK` (the water's colour
 * comes from `waterColor`). */
export const groundColour = (tile: Tile, ground: Ground): number =>
  ground === 'grass' && (tile.height === 3 || tile.height === 4) ? BIOME_LOOK[tile.biome].ground : LOOK[ground].color;
/** The red of a lone water cell and of a cell in the middle of a lake, as the instance colour holds them: the shore foam reads where on
 * that way a cell lies (#1101). */
const SHORE_RED = new THREE.Color(WATER.shore).r;
const DEEP_RED = new THREE.Color(WATER.deep).r;
/** The colour of a water cell: the share of its six neighbours that are water sets how far it lies from the shore. */
export function waterColor(world: World, q: number, r: number): THREE.Color {
  const wet = neighbours([q, r]).filter(([nq, nr]) => world.tile(nq, nr)?.terrain === 'water').length / 6;
  return new THREE.Color(WATER.shore).lerp(new THREE.Color(WATER.deep), wet);
}

/** The props on top of the ground: its height, its look and its geometry. */
const PROPS = {
  mountain: { geometry: new THREE.ConeGeometry(0.62, 1, 6), color: 0x5d6978, emissive: 0x2a1f0c, flat: true },
  tree: { geometry: new THREE.ConeGeometry(0.34, 1, 5), color: 0x2fb5a0, emissive: 0x0b3d36, flat: true },
  boulder: { geometry: new THREE.DodecahedronGeometry(0.34), color: 0x6b7480, emissive: 0x000000, flat: true },
  wall: { geometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), color: 0x14171b, emissive: 0x000000, flat: false },
  cap: { geometry: new THREE.CylinderGeometry(0.52, 0.52, 1, 6), color: SODIUM, emissive: 0x6c4115, flat: false },
} as const;
type Prop = keyof typeof PROPS;
const PROP_NAMES = Object.keys(PROPS) as Prop[];
/** The props that have a model in Blender: the low-poly one in `client/models/openworld.glb` (`ow_<prop>`) and the detailed one
 * in `openworld-hi.glb` (`ow_<prop>_hi`), drawn near the hero (#989). */
const MODELLED = ['mountain', 'tree', 'boulder', 'wall'] as const;
/** The landmark of a boss lair (#1171), in `openworld-lair.glb`: the open one and the beaten one, painted by vertex colours. */
const LAIR_MODELS = ['lair', 'lair_beaten'] as const;
export type PropGeometries = Partial<Record<Prop | (typeof LAIR_MODELS)[number], THREE.BufferGeometry>>;
/** The geometries of both sets of models: `low` the low-poly props (and the lair landmarks), `high` the detailed ones. */
export type PropModels = { low: PropGeometries; high: PropGeometries };
export type ModelUrls = { low: string; high: string; lair?: string };

/** The geometries of the models named `ow_<name><suffix>` in the glTF at `url`; a failed load gives none, the procedural shapes stay. */
async function readModels(
  url: string,
  loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> },
  suffix: string,
  names: readonly (Prop | (typeof LAIR_MODELS)[number])[] = MODELLED,
): Promise<PropGeometries> {
  try {
    const { scene } = await loader.loadAsync(url);
    const out: PropGeometries = {};
    for (const prop of names) {
      const mesh = scene.getObjectByName(`ow_${prop}${suffix}`) as THREE.Mesh | undefined;
      if (mesh) out[prop] = mesh.geometry;
    }
    return out;
  } catch {
    return {};
  }
}

/** The models of both files: a failed file leaves its set empty, so the props it would give stay procedural or low-poly. */
export async function loadModels(urls: ModelUrls, loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> }): Promise<PropModels> {
  const [low, high, lair] = await Promise.all([
    readModels(urls.low, loader, ''),
    readModels(urls.high, loader, '_hi'),
    urls.lair ? readModels(urls.lair, loader, '', LAIR_MODELS) : {},
  ]);
  return { low: { ...low, ...lair }, high };
}

/** A detailed mesh holds the cells within `HI_RADIUS` of the hero: 3r(r+1)+1 of them, the most a build puts in one. */
export const HI_RADIUS = 8;
export const HI_CAPACITY = 3 * HI_RADIUS * (HI_RADIUS + 1) + 1;

const RADIUS = HEX_RADIUS; // a hex of side 0.56 tiles a grid of spacing 1 with a thin gap
export const MARBLE = 0.3;

/** The landmark of a boss lair (#1170): a tall pillar on a flat plinth, gold while the lair is unbeaten, green once beaten. */
export const LAIR_LOOK = { open: 0xffb020, beaten: 0x4caf6a, height: 5 };
/** The looks of the marbles (#1138): glossy, with the ring colours of the interface, cyan on the hero and the troop (the last move), amber
 * on the foes (revealed). The stripe is the ring that shows the roll. */
export const MARBLE_LOOK = {
  hero: { base: 0xcfe8ff, stripe: 0x6fa8dc, roughness: 0.08 },
  troop: { base: 0x8fc4f5, stripe: 0x6fa8dc, roughness: 0.12 },
  foes: { base: 0x15171c, stripe: 0xffb000, roughness: 0.15 },
} as const;
const WALL = 0.9;
const CAP = 0.07;

/** The height of one level of the relief: a cell of level `h` stands `0.2 + STEP * h` high, a peak (level 7) `0.2 + 7 * STEP`.
 * Kept by looking at the screenshots of #988 (openworld-terrain.md section 5). */
export const STEP = 0.5;
/** The height of the top of a cell's ground: water lies low. */
export const topOf = (terrain: Terrain, height: number): number => (terrain === 'water' ? 0.08 : 0.2 + STEP * height);
/** The camera's height eases to the hero's column top with this time constant, in seconds, and snaps within `SETTLED` (#988). */
const EASE = 0.12;
const SETTLED = 0.01;
/** The camera's turn round the hero eases the same way, with its own time constant, and snaps within `SETTLED_YAW` (radians, #1026). */
const EASE_YAW = 0.12;
const SETTLED_YAW = 0.001;

/** A stable 0 to 1 draw per cell, so the mountains and the trees differ in height but never change between draws. */
export const variety = (q: number, r: number): number => (((Math.imul(q, 73856093) ^ Math.imul(r, 19349663)) >>> 0) % 100) / 100;

/** The material of a prop's mesh: its look, the same for its low-poly and its detailed mesh. */
const propMaterial = (prop: Prop, sway: THREE.Node): THREE.Material => {
  const { color, emissive, flat } = PROPS[prop];
  const look = { color, emissive, roughness: 0.8, flatShading: flat };
  if (prop !== 'tree') return new THREE.MeshStandardMaterial(look);
  const material = new THREE.MeshStandardNodeMaterial(look); // the trees lean in the wind with a term of their vertex shader (#1102)
  material.positionNode = sway;
  return material;
};
/** The instance colours of a mesh of `capacity` instances, all white: the colour of an instance a build does not set. */
const whiteColours = (capacity: number): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
/** The writer of a build's props: a prop of a cell (`near`: within `HI_RADIUS`). */
type Lay = (prop: Prop, near: boolean, x: number, y: number, z: number, scaleY: number, colour: number) => void;
/** The colour that leaves an instance as its mesh's material has it (no tint). */
const WHITE = 0xffffff;
/** A cell with no height: the props of a count are laid at no place, so the position they are given is never read. */
const NOWHERE = { x: 0, z: 0 };
/** The modelled prop of each terrain: a step moves its instance between the low-poly and the detailed mesh (#1054). */
const PROP_OF: Partial<Record<Terrain, Prop>> = { peak: 'mountain', tree: 'tree', boulder: 'boulder', wall: 'wall' };
/** A cell as one number, the key of its instance in a props mesh. The offset keeps the axial coordinates of any world positive. */
const KEY_SPAN = 2 ** 22;
const cellKey = (q: number, r: number): number => (q + KEY_SPAN / 2) * KEY_SPAN + (r + KEY_SPAN / 2);
/** The instances of a props mesh by cell (#1054): `cells[i]` is the cell of instance `i`, `at` the instance of each cell. */
interface Slots {
  cells: number[];
  at: Map<number, number>;
}
/** The cells within `HI_RADIUS` of `centre` (the hex ball), each visited once. */
const eachNear = (centre: Axial, visit: (cell: Axial) => void): void => {
  for (let dq = -HI_RADIUS; dq <= HI_RADIUS; dq++) {
    for (let dr = Math.max(-HI_RADIUS, -dq - HI_RADIUS); dr <= Math.min(HI_RADIUS, -dq + HI_RADIUS); dr++) visit([centre[0] + dq, centre[1] + dr]);
  }
};

/** A push as the mode has played it: the hero and the troop before it (the hero first), the enemies before it, and the push the bridge
 * gave (`readPush`). The view draws the way from the first cells to the second ones. */
export interface Played {
  from: Axial[];
  foes: Axial[];
  push: Pushed;
}

/** The times of a push, in ms, at normal speed (docs/specs/openworld.md section 4): the lunge of the pushing line; the enemies slide
 * from the contact, 40 % into the lunge; an ejected marble slides into the water, then sinks. */
export const LUNGE_MS = 400;
const CONTACT = 0.4 * LUNGE_MS;
export const SLIDE_MS = 250;
export const FALL_MS = 300;
/** How far an ejected marble sinks below the ground, in world units. */
const SINK = 0.6;

/** The lunge: an ease-out that passes the cell by a tenth of a cell, at 80 % of the lunge, and settles back on it. */
const lungeEase = (t: number): number => {
  if (t <= 0.8) {
    const u = t / 0.8;
    return 1.1 * (1 - (1 - u) * (1 - u));
  }
  const v = (t - 0.8) / 0.2;
  return 1.1 - 0.1 * (v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2);
};
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** The way of one marble in a push: from its old cell to its new one (`x0`..`z0` to `x1`..`z1`, the heights `y0`, `y1`), at `start`,
 * over `span` ms, then sinking over `fall` ms (an ejected marble only). `lunge` tells the ease. */
interface Move {
  mesh: 'hero' | 'troop' | 'foes' | 'ejected';
  index: number;
  start: number;
  span: number;
  fall: number;
  lunge: boolean;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}
type Timing = Pick<Move, 'start' | 'span' | 'fall' | 'lunge'>;

export class OpenWorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, NEAR, CAMERA_FAR);
  private readonly fog = new THREE.Fog(SHIP_BLACK);
  private level = 1;
  /** The zoom drawn at the current turn: `level`, or less where a narrow window of turns would pass MAX_REACH (`fitZoom`). */
  private drawnLevel = 1;
  /** The widest zoom on the screen's aspect, see `maxZoomFor`. */
  private limit = maxZoomFor(1);
  /** The chunk the loaded square is centred on: kept while the square covers the hero's ball, else the hero's chunk (#1046). */
  private centre: Axial = [0, 0];
  /** The chunks drawn (the centre and the reach): a change lays every mesh again. `drawnKey` adds the hero's cell, which only
   * the props depend on, so a step moves the props that switch between detailed and plain, and no others (#1034, #1054). */
  private drawnChunks = '';
  private drawnKey = '';
  private loadedReach = 0;
  private readonly grounds = {} as Record<Ground, THREE.InstancedMesh>;
  /** The low tier's flat tops (#1234): a ground cell no neighbour lies below shows no side, so it is drawn as its top alone (6 triangles
   * in place of 24). One mesh per ground, empty on the high tier. */
  private readonly flats = {} as Record<Ground, THREE.InstancedMesh>;
  private flatTops = false;
  private readonly props = {} as Record<Prop, THREE.InstancedMesh>;
  /** The detailed meshes of the modelled props, and the props whose detailed model has arrived: only those draw near the hero. */
  private readonly detailed: Partial<Record<Prop, THREE.InstancedMesh>> = {};
  private readonly detailedReady = new Set<Prop>();
  /** The instances of each props mesh by cell: a step moves the cells that cross `HI_RADIUS` between two meshes (#1054). */
  private readonly slots = new Map<THREE.InstancedMesh, Slots>();
  /** The hero cell the props are laid for: a step moves the props from it to the new cell. Undefined until a build lays them. */
  private laidHero: Axial | undefined;
  /** The meshes a build lays: the ground columns, the props and the detailed props. */
  private readonly managed: THREE.InstancedMesh[] = [];
  /** What a build or a model swap replaced, freed by `drain` after the next frame (#1017). */
  private readonly retired: { dispose(): void }[] = [];
  private readonly hero: THREE.Mesh;
  /** The cell the hero is on, the centre of the pick. */
  private heroCell: Axial = [0, 0];
  /** The point the camera looks at: the hero's x and z, its height eased to the hero's column top (#988). The first show puts it
   * there at once (`placed`): the camera does not glide in from the origin. */
  private readonly focus = new THREE.Vector3();
  /** The camera's offsets (punch, pan ease, shake, #1103) and the point they look at: never the focus, which the chunks follow. */
  private readonly life = new CameraLife();
  private readonly lifeAt = new THREE.Vector3();
  private lifeOn = false;
  private screen = { width: 800, height: 600 };
  private placed = false;
  private troop: THREE.InstancedMesh;
  private foes: THREE.InstancedMesh;
  /** Reused by every placement, so a draw allocates no matrix holder (#981). */
  private readonly dummy = new THREE.Object3D();
  /** Reused by every instance colour written, so a build allocates none. */
  private readonly colour = new THREE.Color();
  private readonly enemyCells: Axial[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly ground = new THREE.Vector3();
  /** The enemy marbles drawn around the hero. */
  enemyCount = 0;
  /** The marble of an ejected enemy while it falls: its own mesh and material, shown only while the fall plays (#967). */
  readonly ejected: THREE.Mesh;
  /** The marbles of the push being drawn (none when there is no animation), and the time it ends in ms. */
  private moves: Move[] = [];
  private end = 0;
  /** The turn of the camera round the hero, in radians: `yawNow` eases to `yawGoal`, which the keys, a drag and a twist set (#1026). */
  private yawNow = 0;
  private yawGoal = 0;
  /** The hero (the first marble) and the troop's marbles: where each is drawn, and the glide of a step under way (#1040). */
  private readonly marbles: Marble[] = [new Marble(MARBLE)];
  /** The strength of the marbles' stripe at the drawn zoom (openworldstripe.ts), one uniform for every marble material (#1043). */
  private readonly stripe = stripeFadeNode();
  /** Holds the drawn pose of a marble, apart from `dummy`: a build leaves its turn as it is, a marble's is set by its glide. */
  private readonly drawnPose = new THREE.Object3D();
  /** The time the glide of a step lands, in ms: a push's lunge starts then. Whether a marble glides or leans on the last tick. */
  private landed = 0;
  private moving = false;
  /** The particles (#1110): one pool, drawn as one instanced mesh, and the holders the frame reuses. */
  private readonly particles = new ParticlePool(capFor());
  private readonly sparks: THREE.InstancedMesh;
  private readonly sparkPose = new THREE.Object3D();
  private readonly sparkLook = { x: 0, y: 0, z: 0, s: 0, colour: 0 };
  /** What the water's and the trees' shaders read (#1101, #1102): the clock, the amplitudes and the ripples. No mesh or instance is written. */
  readonly uniforms = motionUniforms();
  private readonly sway = swayPosition(this.uniforms);
  private readonly ripplePool = new RipplePool();
  /** The time of the last `animate` (ms), whether a loop was drawn then, and what moved. */
  private motionNow = 0;
  private looping = false;
  private motionKinds = '';

  /** `fight` holds the enemies as they are now: the generated ones, with the pushes of the troop on top (openworldfight.ts). */
  constructor(
    private readonly world: World,
    private readonly fight: FightState = new FightState(),
    /** The skins of the ship the marbles wear (#1176); none draws the plain looks. */
    skins?: MarbleSkins,
  ) {
    this.scene.background = new THREE.Color(SHIP_BLACK);
    this.scene.fog = this.fog;
    addSun(this.scene); // the arena's light too (tablezero.ts): the room and the map share one sun
    const prism = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6);
    const top = topOnly(prism);
    for (const ground of GROUNDS) {
      const { emissive } = LOOK[ground];
      // The colour comes per instance (groundColour), so the material is white: the water's way too. A glossy water surface catches the
      // sun; its cells get a light line along the edge, the land a dark seam (openworldedge.ts, #1138).
      const water = ground === 'water';
      const material = () => edgeMaterial({ emissive, roughness: water ? 0.2 : 0.9, gain: water ? EDGE_GAIN.water : EDGE_GAIN.land, emissiveNode: water ? waterEmissive(this.uniforms, SHORE_RED, DEEP_RED) : undefined, positionNode: ground === 'sand' ? shimmerPosition(this.uniforms) : undefined });
      this.grounds[ground] = this.instances(`terrain-${ground}`, CAPACITY[ground], prism, material());
      this.managed.push(this.grounds[ground]);
      this.flats[ground] = this.instances(`terrain-${ground}-flat`, 1, top, material()); // grows on the first low build (`fit`)
      this.managed.push(this.flats[ground]);
    }
    for (const prop of PROP_NAMES) {
      this.props[prop] = this.instances(`prop-${prop}`, CAPACITY[prop], PROPS[prop].geometry, propMaterial(prop, this.sway));
      this.managed.push(this.props[prop]);
    }
    for (const prop of MODELLED) {
      this.detailed[prop] = this.instances(`prop-${prop}-hi`, HI_CAPACITY, PROPS[prop].geometry, propMaterial(prop, this.sway));
      this.managed.push(this.detailed[prop]!);
    }
    this.hero = new THREE.Mesh(new THREE.SphereGeometry(MARBLE, 24, 16), stripedMaterial(MARBLE_LOOK.hero, this.stripe, skins?.player));
    this.hero.name = 'hero';
    this.scene.add(this.hero);
    const marble = new THREE.SphereGeometry(MARBLE, 16, 12);
    this.troop = this.instances('troop', CAPACITY.troop, marble, stripedMaterial(MARBLE_LOOK.troop, this.stripe, skins?.player));
    this.foes = this.instances('enemies', CAPACITY.enemies, marble, stripedMaterial(MARBLE_LOOK.foes, this.stripe, skins?.shell));
    this.ejected = new THREE.Mesh(new THREE.SphereGeometry(MARBLE, 16, 12), stripedMaterial(MARBLE_LOOK.foes, this.stripe, skins?.shell));
    this.ejected.name = 'ejected';
    this.ejected.visible = false;
    this.scene.add(this.ejected);
    this.sparks = this.instances('particles', this.particles.cap, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  }

  /** An instanced mesh of `capacity` instances, each with its own colour (3 floats, white until a build sets it, #984). Its geometry
   * is its own copy (#991): three frees a mesh's instance buffers with the geometry of the mesh, and a geometry shared by two meshes
   * frees only the first one's. */
  private instances(name: string, capacity: number, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry.clone(), material, capacity);
    mesh.instanceColor = whiteColours(capacity);
    mesh.count = 0;
    mesh.frustumCulled = false; // its bounds come from the first instances, the fog hides the rest
    mesh.name = name;
    this.scene.add(mesh);
    return mesh;
  }

  /** Swaps the procedural shapes for the models: the low-poly ones for every cell, the detailed ones near the hero (#989). The
   * chunks are rebuilt at once, so the detailed props show without a step. */
  useModels({ low, high }: PropModels): void {
    for (const prop of PROP_NAMES) {
      const geometry = low[prop];
      if (geometry) this.paint(this.props[prop], geometry);
    }
    for (const prop of MODELLED) {
      const geometry = high[prop];
      if (!geometry) continue;
      this.paint(this.detailed[prop]!, geometry);
      this.detailedReady.add(prop);
    }
    if (low.lair && low.lair_beaten) {
      this.lairModels = { open: low.lair, beaten: low.lair_beaten };
      this.setLairs(this.lairCells, this.lairsBeaten); // the landmarks already stood are drawn again with the models
    }
    this.drawnKey = '';
    this.laidHero = undefined; // the next frame lays every prop again: the meshes it replaced are empty
    this.frame();
  }

  /** The lair cells and the beaten ones of the last `setLairs`, and the Blender landmarks once they are in (#1171). */
  private lairCells: readonly Axial[] = [];
  private lairsBeaten: readonly number[] = [];
  private lairModels?: { open: THREE.BufferGeometry; beaten: THREE.BufferGeometry };

  /** Gives a prop's mesh a model's geometry. A model that paints itself (vertex colours from Blender) is drawn as painted: no tint
   * hides it. */
  private paint(mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry): void {
    const painted = this.replace(mesh, geometry.clone(), mesh.instanceMatrix.count);
    if (geometry.hasAttribute('color')) {
      const material = painted.material as THREE.MeshStandardMaterial;
      material.vertexColors = true;
      material.color.set(0xffffff);
      material.emissive.set(0x000000);
      material.needsUpdate = true;
    }
  }

  /** A new screen size: the aspect changes the ground in view, so the widest zoom and the loaded chunks follow (#976). */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.screen = { width, height };
    this.endLife();
    this.limit = maxZoomFor(this.camera.aspect);
    this.level = Math.min(this.level, this.limit);
    this.frame();
  }

  /** A troop push lands at `now` (ms): the zoom goes in 3 % and back (#1103). */
  punch(now: number): void {
    this.life.punch(now);
  }

  /** An enemy is ejected at `now` (ms): the image shakes (#1103). */
  shake(now: number): void {
    this.life.shake(now);
  }

  /** The follow eases from `now` (ms) as the hero goes from cell `from` to cell `to` (a walk starts: the follow lags behind it). */
  panFor(from: Axial, to: Axial, now: number): void {
    const a = axialTo3D(from[0], from[1]);
    const b = axialTo3D(to[0], to[1]);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    this.life.pan(now, (b.x - a.x) / d, (b.z - a.z) / d, -1);
  }

  /** The walk ends at `now` (ms): the follow settles with a little carry (#1103). */
  panEnd(now: number): void {
    this.life.panEnd(now);
  }

  /** Draws the camera's offsets at `now` (ms) on top of the base camera, which `frame` set: the punch scales the zoom, the pan moves the
   * point looked at, the shake shifts the image. The chunks, the focus and the player's zoom are not touched. Returns whether the camera
   * moved this call, the last one included (it puts the base back exactly). */
  offsets(now: number): boolean {
    if (this.life.at(now)) {
      const { focus, lifeAt, life } = this;
      lifeAt.set(focus.x + life.panX, focus.y, focus.z + life.panZ);
      lookAtHero(this.camera, lifeAt, this.drawnLevel * life.zoom, this.yawNow);
      const { width, height } = this.screen;
      this.camera.setViewOffset(width, height, -life.shakeX, 0, width, height);
      this.lifeOn = true;
      return true;
    }
    return this.endLife();
  }

  /** What the camera draws now, for the browser checks (#1103): the zoom with the punch, the image shake in pixels, the chunk centre
   * and the reach loaded. */
  probe(): { zoom: number; shake: number; centre: Axial; reach: number } {
    return { zoom: this.drawnLevel * this.life.zoom, shake: this.camera.view?.enabled ? -this.camera.view.offsetX : 0, centre: this.centre, reach: this.loadedReach };
  }

  /** Cuts the offsets: the base camera at once. Returns whether there were some to cut. */
  private endLife(): boolean {
    const was = this.lifeOn;
    this.life.reset();
    this.lifeOn = false;
    if (was) {
      this.camera.clearViewOffset();
      this.frame();
    }
    return was;
  }

  /** The widest zoom on this screen: a wide screen stops sooner, so the loaded chunks always cover the ground in view. */
  get maxZoom(): number {
    return this.limit;
  }

  /** Whether a lake is drawn, so its glow moves. */
  get hasWater(): boolean {
    return this.grounds.water.count + this.flats.water.count > 0;
  }

  /** Moves the particles to `now` (ms) and writes them to the mesh: the ambient ones of the hero's biome (docs/specs/openworld-animation.md
   * section 6), born round the hero. None under reduced motion, on the low tier (`lowTier`, the puffs of a step stay) or past `ROLL_ZOOM`. Returns whether the frame must draw them: some are
   * alive, or were on the last call and are erased now. */
  sparkle(now: number, reduced: boolean, lowTier = false): boolean {
    const { particles, sparks, sparkPose, sparkLook } = this;
    if (this.drawnLevel > ROLL_ZOOM) particles.clear();
    else if (reduced) particles.clear(true); // the fade of a broken prop stays (#1147)
    else particles.step(now, this.hero.position, lowTier ? undefined : AMBIENT[this.world.tile(this.heroCell[0], this.heroCell[1])!.biome]);
    let n = 0;
    for (let i = 0; i < particles.cap; i++) {
      if (!particles.pose(i, now, sparkLook)) continue;
      sparkPose.position.set(sparkLook.x, sparkLook.y, sparkLook.z);
      sparkPose.scale.setScalar(sparkLook.s);
      sparkPose.updateMatrix();
      sparks.setMatrixAt(n, sparkPose.matrix);
      sparks.setColorAt(n, this.colour.setHex(sparkLook.colour));
      n++;
    }
    const drawn = n > 0 || sparks.count > 0;
    sparks.count = n;
    if (n > 0) {
      sparks.instanceMatrix.needsUpdate = true;
      sparks.instanceColor!.needsUpdate = true;
    }
    return drawn;
  }

  /** The particles drawn now. */
  get sparkCount(): number {
    return this.sparks.count;
  }

  /** The dust puff of a step, thrown up from the cell the hero leaves at `now` (ms); none past `ROLL_ZOOM`. */
  puff(now: number): void {
    if (this.drawnLevel > ROLL_ZOOM) return;
    const { x, y, z } = this.hero.position;
    this.particles.puff(x, y - MARBLE + 0.05, z, now);
  }

  /** The hero broke the `terrain` obstacle on `cell` at `now` (ms) (#1147): the world has the cell open already. Its prop leaves its mesh,
   * and its shards fly (a fade under `reduced` motion); the shards are particles, so a break allocates nothing. None past `ROLL_ZOOM`. */
  smash([q, r]: Axial, terrain: Terrain, now: number, reduced: boolean): void {
    const prop = PROP_OF[terrain]!;
    this.removeProp(this.route(prop, hexDistance([q, r], this.laidHero!) <= HI_RADIUS), cellKey(q, r)); // the hero has been shown: the props are laid
    if (this.drawnLevel > ROLL_ZOOM) return;
    const p = axialTo3D(q, r);
    const tile = this.world.tile(q, r)!;
    this.particles.shatter(p.x, topOf(GROUND[tile.terrain], tile.height) + 0.2, p.z, now, PROPS[prop].color, reduced);
  }

  /** Moves what the shaders move to `now` (ms) (docs/specs/openworld-animation.md sections 3 and 4): the shore foam and the sway of the trees
   * are loops of the materials, the ripples were born by `ripple`. Nothing under `calm` (reduced motion, the low tier) or past
   * `ROLL_ZOOM`. Returns whether the frame must draw: a lake or trees are in view and it moves, or it moved on the last call and is
   * stilled now. */
  animate(now: number, calm: boolean): boolean {
    const u = this.uniforms;
    const on = !calm && this.drawnLevel <= ROLL_ZOOM;
    const water = on && this.hasWater;
    const trees = on && (this.props.tree.count > 0 || this.detailed.tree!.count > 0);
    u.time.value = now;
    u.foam.value = on ? FOAM_GAIN : 0;
    u.sway.value = on ? 1 : 0;
    const shimmer = on && this.world.tile(this.heroCell[0], this.heroCell[1])!.biome === 'desert' && this.grounds.sand.count + this.flats.sand.count > 0;
    u.shimmer.value = shimmer ? 1 : 0;
    u.span.value = RIPPLE_MS * slowBy();
    this.motionNow = now;
    if (!on) this.ripplePool.clear();
    writeRipples(this.ripplePool, u);
    this.motionKinds = [water && 'water', trees && 'trees', shimmer && 'shimmer'].filter(Boolean).join(',');
    const drawn = this.looping || this.motionKinds !== '';
    this.looping = this.motionKinds !== '';
    return drawn;
  }

  /** What moves now, for the browser checks: `water`, `trees`, both, or nothing. */
  get alive(): string {
    return this.motionKinds;
  }

  /** The ripples alive at the last `animate`. */
  get ripples(): number {
    return this.ripplePool.live(this.motionNow, slowBy());
  }

  /** The hero steps from `from` to `to` at `now` (ms): a ring spreads from its cell when either is next to water. None under `calm`, with no
   * lake in view, or past `ROLL_ZOOM`. */
  ripple(from: Axial, to: Axial, now: number, calm: boolean): void {
    if (calm || this.drawnLevel > ROLL_ZOOM || !this.hasWater) return;
    const wet = ([q, r]: Axial): boolean => this.world.tile(q, r)?.terrain === 'water';
    if (!neighbours(from).some(wet) && !neighbours(to).some(wet)) return;
    const p = axialTo3D(to[0], to[1]);
    this.ripplePool.spawn(p.x, p.z, now);
  }

  /** The glow of the water breathes slowly: `ms` is the time, 0 holds it still (reduced motion). */
  glow(ms: number): void {
    for (const mesh of [this.grounds.water, this.flats.water]) (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + 0.15 * Math.sin(ms / 1200);
  }

  /** Draws the world around the hero at `at`: the chunks are rebuilt when the hero's ball leaves the loaded square (`frame`),
   * the hero and the camera follow every step. */
  show(at: Axial, troop: readonly Axial[] = [], glide?: { now: number; span: number; pace?: Pace }): void {
    this.heroCell = [at[0], at[1]];
    if (glide && this.placed) this.glideTo(at, troop, glide);
    else this.snapTo(at, troop);
    this.frame();
  }

  /** Stands the hero on `at` and the troop on `troop` at once: no glide (a world entered, a fixture, reduced motion). */
  private snapTo(at: Axial, troop: readonly Axial[]): void {
    this.place(this.troop, troop);
    this.landed = 0;
    this.marbleAt(0).place(this.standing(at));
    troop.forEach((cell, i) => this.marbleAt(i + 1).place(this.standing(cell)));
    this.draw(0);
    if (!this.placed) {
      this.focus.y = this.hero.position.y;
      this.placed = true;
    }
  }

  /** The hero and each troop marble glide from where they are at `now` to the cells of a step (#1040): the hero, then the troop, each
   * marble to the cell of the one before it. The glides land at `now + span`, where a push's lunge starts (`landed`). */
  private glideTo(at: Axial, troop: readonly Axial[], { now, span, pace }: { now: number; span: number; pace?: Pace }): void {
    const roll = this.drawnLevel <= ROLL_ZOOM;
    [at, ...troop].forEach((cell, i) => {
      const delay = roll ? Math.min(i * TROOP_DELAY, span / 2) : 0; // the troop follows the hero, each marble a little later, landing with it (#1100)
      if (this.marbleAt(i).go(this.standing(cell), now, span - delay, roll, pace, delay)) this.landed = Math.max(this.landed, now + span);
    });
  }

  /** The marble at index `i` (0 the hero, then the troop), made when the troop grows. */
  private marbleAt(i: number): Marble {
    while (this.marbles.length <= i) this.marbles.push(new Marble(MARBLE));
    return this.marbles[i]!;
  }

  /** The place a marble stands on at a cell: the cell's centre, on the top of its ground. */
  private standing([q, r]: Axial): Vec {
    const p = axialTo3D(q, r);
    const tile = this.world.tile(q, r)!;
    return { x: p.x, y: topOf(GROUND[tile.terrain], tile.height) + MARBLE, z: p.z };
  }

  /** A blocked step leans the hero toward the cell it cannot take, and back on its own cell over `span` ms (#1040). */
  nudge(at: Axial, to: Axial, now: number, span: number): void {
    const a = axialTo3D(at[0], at[1]);
    const b = axialTo3D(to[0], to[1]);
    this.marbleAt(0).bump({ x: b.x - a.x, y: 0, z: b.z - a.z }, now, span);
  }

  /** The walk ends at `now` (ms): every marble in a glide at the walking speed slows to rest on its cell, on time (#1065). */
  brake(now: number): void {
    const roll = this.drawnLevel <= ROLL_ZOOM;
    for (const marble of this.marbles) marble.brake(now, roll);
  }

  /** Whether a marble glides or leans on the last tick: the frame is drawn while it does (the mode marks it). */
  get gliding(): boolean {
    return this.moving;
  }

  /** Draws the marbles that glide or lean at `now` (ms): the hero, which the camera follows, and the troop. Returns whether one moves. */
  private glideMarbles(now: number): boolean {
    const roll = this.drawnLevel <= ROLL_ZOOM;
    const hero = this.marbleAt(0).tick(now, roll);
    if (hero) {
      this.draw(0);
      this.frame();
    }
    let troop = false;
    for (let i = 1; i < this.marbles.length; i++) {
      if (!this.marbles[i]!.tick(now, roll)) continue;
      this.draw(i);
      troop = true;
    }
    this.moving = hero || troop;
    return this.moving;
  }

  /** Writes the drawn pose of marble `i` (0 the hero, then the troop) to its mesh: the hero itself, or the troop's instance. The camera
   * follows the hero's place (`focus`). */
  private draw(i: number): void {
    const { x, y, z, q, sx, sy } = this.marbles[i]!.pose;
    if (i === 0) {
      this.hero.position.set(x, y, z);
      this.hero.quaternion.copy(q);
      this.hero.scale.set(sx, sy, sx);
      this.focus.x = x;
      this.focus.z = z;
      return;
    }
    const { drawnPose } = this;
    drawnPose.position.set(x, y, z);
    drawnPose.quaternion.copy(q);
    drawnPose.scale.set(sx, sy, sx);
    drawnPose.updateMatrix();
    this.troop.setMatrixAt(i - 1, drawnPose.matrix);
    this.troop.instanceMatrix.needsUpdate = true;
  }

  /** The height the camera looks at: the hero's column top, eased to it by `ease` (the browser checks and the tests read it). */
  get focusHeight(): number {
    return this.focus.y;
  }

  /** Eases the camera's height to the hero's column top, `dt` seconds on: the gap closes by `1 - exp(-dt / EASE)` of itself, so it
   * never overshoots. It snaps when `instant` (reduced motion) or within `SETTLED` of the top. Returns whether the camera moved,
   * so the frame is drawn; false once it has settled (#988). */
  ease(dt: number, instant: boolean): boolean {
    const target = this.hero.position.y;
    const gap = target - this.focus.y;
    if (gap === 0) return false;
    this.focus.y = instant || Math.abs(gap) <= SETTLED ? target : this.focus.y + gap * (1 - Math.exp(-dt / EASE));
    this.frame();
    return true;
  }

  /** The point the camera looks at, on the ground under the hero (the tests and the browser checks read it). */
  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  /** The drawn height of the hero, hop included (the browser checks read it, #1100). */
  get heroY(): number {
    return this.hero.position.y;
  }

  /** Whether a push is still drawn in between its cells. */
  get animating(): boolean {
    return this.moves.length > 0;
  }

  /** Plays a push whose state is already final (the mode lays the cells first): each marble of the pushing line starts on its old
   * cell and lunges to the new one from `now` (ms), the enemies slide from the contact, the ejected one slides into the water and
   * sinks. `slow` multiplies every duration. Nothing is laid here: `tick` draws the marbles in between (docs/specs/openworld.md section 4). */
  playPush({ from, foes, push }: Played, now: number, slow = 1): void {
    this.settle();
    const begin = Math.max(now, this.landed); // the lunge starts once the step's glide has landed (#1040)
    const [hero] = push.troop;
    this.heroCell = hero!; // the chunks follow the hero to the cell the push ends on, when its ball leaves the square (`frame`)
    const at = (ms: number): number => ms * slow;
    const moves: Move[] = [];
    const lunge: Timing = { start: begin, span: at(LUNGE_MS), fall: 0, lunge: true };
    from.forEach((cell, i) => {
      const to = push.troop[i]!;
      if (!same(cell, to)) moves.push(this.move(i === 0 ? 'hero' : 'troop', i === 0 ? 0 : i - 1, cell, to, lunge));
    });
    const slide: Timing = { start: begin + at(CONTACT), span: at(SLIDE_MS), fall: 0, lunge: false };
    const [ejected] = push.ejected;
    let next = 0; // the enemies are kept in the order of the push, the ejected one left out
    for (const cell of foes) {
      if (ejected && same(cell, ejected)) continue;
      const to = push.enemies[next++]!;
      const index = same(cell, to) ? -1 : this.enemyCells.findIndex((enemy) => same(enemy, to)); // not drawn: off the loaded chunks
      if (index >= 0) moves.push(this.move('foes', index, cell, to, slide));
    }
    if (ejected) {
      const beyond: Axial = [ejected[0] + push.dir[0], ejected[1] + push.dir[1]];
      moves.push(this.move('ejected', 0, ejected, beyond, { start: begin + at(CONTACT), span: at(SLIDE_MS), fall: at(FALL_MS), lunge: false }));
      if (this.drawnLevel <= ROLL_ZOOM) {
        const p = axialTo3D(beyond[0], beyond[1]);
        this.particles.splash(p.x, topOf('water', 0) + 0.05, p.z, begin + at(CONTACT) + at(SLIDE_MS)); // the droplets rise as the fall starts (#1101)
      }
    }
    this.moves = moves;
    this.end = Math.max(...moves.map((m) => m.start + m.span + m.fall));
    this.ejected.visible = Boolean(ejected);
  }

  /** Draws the marbles that glide or lean at `now` (ms), and the marbles of the push in between their cells. Returns whether any is
   * drawn by this call: the call that reaches the end of a push draws the final cells and drops the push, the next one returns false. */
  tick(now: number): boolean {
    const gliding = this.glideMarbles(now);
    if (this.moves.length === 0) return gliding;
    if (now >= this.end) {
      this.settle();
      return true;
    }
    this.play(now);
    return true;
  }

  /** Puts every marble of the push on its final cell at once, and ends the push: a step, a click, a zoom or a resize calls it first. */
  snap(): void {
    this.settle();
  }

  /** Ends the push on its final cells. */
  private settle(): void {
    if (this.moves.length === 0) return;
    this.play(this.end);
    this.moves = [];
    this.ejected.visible = false;
  }

  /** Writes every marble of the push at `now`. The hero is written first: the camera follows its drawn place, and the frame may
   * rebuild the enemies as they stand, so the others are written after it. */
  private play(now: number): void {
    let heroMoves = false;
    for (const m of this.moves) {
      if (m.mesh !== 'hero') continue;
      this.write(m, now);
      heroMoves = true;
    }
    if (heroMoves) this.frame();
    for (const m of this.moves) if (m.mesh !== 'hero') this.write(m, now);
  }

  /** Writes one marble of a push at `now` (ms): its place between the cells, and its size and sinking when it falls. */
  private write(m: Move, now: number): void {
    const t = Math.min(1, Math.max(0, (now - m.start) / m.span));
    const f = m.lunge ? lungeEase(t) : easeOutCubic(t);
    let y = m.y0 + (m.y1 - m.y0) * f;
    let scale = 1;
    if (m.fall > 0) {
      const k = Math.min(1, Math.max(0, (now - m.start - m.span) / m.fall));
      y -= SINK * k;
      scale = 1 - k;
    }
    const x = m.x0 + (m.x1 - m.x0) * f;
    const z = m.z0 + (m.z1 - m.z0) * f;
    if (m.mesh === 'hero' || m.mesh === 'troop') {
      if (now < m.start) return; // the step's glide is drawn until the lunge starts (#1040)
      const i = m.mesh === 'hero' ? 0 : m.index + 1;
      this.marbleAt(i).put({ x, y, z });
      this.draw(i);
    } else if (m.mesh === 'ejected') {
      this.ejected.position.set(x, y, z);
      this.ejected.scale.setScalar(scale);
    } else {
      const { dummy } = this;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.foes.setMatrixAt(m.index, dummy.matrix);
      this.foes.instanceMatrix.needsUpdate = true;
    }
  }

  /** The way of a marble from `from` to `to`, on the heights of their cells; a cell off the loaded world keeps the height. */
  private move(mesh: Move['mesh'], index: number, from: Axial, to: Axial, timing: Timing): Move {
    const a = axialTo3D(from[0], from[1]);
    const b = axialTo3D(to[0], to[1]);
    const y0 = this.rest(from)!;
    return { mesh, index, ...timing, x0: a.x, y0, z0: a.z, x1: b.x, y1: this.rest(to) ?? y0, z1: b.z };
  }

  /** The height of a marble standing on a cell, `undefined` off the loaded world. */
  private rest([q, r]: Axial): number | undefined {
    const tile = this.world.tile(q, r);
    return tile && topOf(GROUND[tile.terrain], tile.height) + MARBLE;
  }

  /** The chunks on each side of the hero's chunk that are drawn: they follow the zoom (#976). */
  get reach(): number {
    return this.loadedReach;
  }

  /** The chunk the loaded square is centred on: the hero's chunk, or the one it was centred on while the square still covers
   * the hero's ball (#1046). */
  get centreChunk(): Axial {
    return this.centre;
  }

  /** The instances drawn per mesh, by name: the ground columns, the props, the troop and the enemies (the browser checks read it). */
  get drawn(): Record<string, number> {
    const meshes = this.scene.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
    return Object.fromEntries(meshes.map((m) => [m.name, m.count]));
  }

  /** The zoom of the camera: 1 is the closest view, `MAX_ZOOM` the widest. */
  get zoom(): number {
    return this.level;
  }

  /** Zooms the camera by `scale`, more than 1 further out and less than 1 closer, between the closest view and the widest. */
  zoomBy(scale: number): void {
    this.level = Math.min(this.limit, Math.max(1, this.level * scale));
    this.frame();
  }

  /** The yaw the camera turns to, in radians: 0 is the default angle (#1026). */
  get yaw(): number {
    return this.yawGoal;
  }

  /** Turns the goal of the camera's yaw by `by` radians round the hero; the camera eases to it (`easeYaw`). */
  turn(by: number): void {
    this.yawGoal = wrapPi(this.yawGoal + by);
  }

  /** Turns the camera to `yaw` at once: the goal and the view, as a world is entered with its saved angle. */
  turnTo(yaw: number): void {
    this.yawGoal = wrapPi(yaw);
    this.yawNow = this.yawGoal;
    this.frame();
  }

  /** Eases the camera's yaw to its goal, `dt` seconds on, the shortest way round, as the height eases (`ease`): the gap closes by
   * `1 - exp(-dt / EASE_YAW)` of itself, and it snaps when `instant` (reduced motion) or within `SETTLED_YAW`. Returns whether the
   * camera moved, so the frame is drawn; false once it has settled. */
  easeYaw(dt: number, instant: boolean): boolean {
    const gap = wrapPi(this.yawGoal - this.yawNow);
    if (gap === 0) return false;
    this.yawNow = instant || Math.abs(gap) <= SETTLED_YAW ? this.yawGoal : wrapPi(this.yawNow + gap * (1 - Math.exp(-dt / EASE_YAW)));
    this.frame();
    return true;
  }

  /** The reach the camera needs at zoom `k` and the current yaw, from its footprint (`groundRadius`, unclipped). */
  private reachOf(at: THREE.Vector3, k: number): number {
    lookAtHero(this.camera, at, k, this.yawNow);
    const hero = cellAtPoint(at.x, at.z);
    return reachFor(Math.max(...footprint(this.camera).map((p) => hexDistance(cellAtPoint(p.x, p.z), hero))));
  }

  /** The zoom drawn at the turn: the zoom of the user, or less where the reach at this turn would pass `MAX_REACH` (a narrow window
   * of turns that `maxZoomFor` does not sample, #1026). The loaded chunks then always cover the ground in view. */
  private fitZoom(at: THREE.Vector3): number {
    if (this.reachOf(at, this.level) <= MAX_REACH) return this.level;
    let low = 1;
    let high = this.level;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (this.reachOf(at, mid) <= MAX_REACH) low = mid;
      else high = mid;
    }
    return low;
  }

  /** The zoom the frame draws: the user's zoom (`zoom`) or less at a narrow turn (`fitZoom`). */
  get drawnZoom(): number {
    return this.drawnLevel;
  }

  /** The strength of the marbles' stripe at the drawn zoom, 1 to 0 (openworldstripe.ts): the browser checks and the tests read it. */
  get stripeFade(): number {
    return this.stripe.value;
  }

  /** Puts the camera at the zoom's distance from the hero, looking down at it, and the fog and the planes of the camera with
   * the zoom. The chunks loaded follow the ground the camera sees: rebuilt when the hero's chunk or the reach changes. */
  private frame(): void {
    const at = this.focus;
    this.drawnLevel = this.fitZoom(at);
    const k = this.drawnLevel;
    this.stripe.value = stripeStrength(k);
    lookAtHero(this.camera, at, k, this.yawNow);
    // The fog starts at the hero's depth and ends past the farthest corner of the footprint, which is the far horizon.
    const corners = footprint(this.camera);
    const view = new THREE.Vector3();
    const depth = Math.max(...corners.map((p) => -view.copy(p).applyMatrix4(this.camera.matrixWorldInverse).z));
    this.fog.near = CAMERA_DISTANCE * k;
    this.fog.far = FOG_BEYOND * depth;
    this.camera.far = this.fog.far * 1.5; // the planes reach past the fog: no ground is clipped
    this.camera.updateProjectionMatrix();
    const hero = cellAtPoint(at.x, at.z);
    const radius = Math.max(...corners.map((p) => hexDistance(cellAtPoint(p.x, p.z), hero)));
    const reach = Math.min(MAX_REACH, reachFor(radius));
    // The centre is kept while the square still covers the hero's ball: a step across a chunk line then lays the props alone (#1046).
    // The detailed props' ball (HI_RADIUS) lies in the square too, so a step only moves props that are loaded (#1054).
    if (!covers(this.centre, reach, hero, Math.max(radius, HI_RADIUS))) this.centre = chunkOf(hero);
    const chunks = `${this.centre},${reach}`;
    const key = `${chunks},${hero}`; // the hero's cell too: it sets which props are detailed (#989)
    if (chunks !== this.drawnChunks) {
      this.drawnChunks = chunks;
      this.drawnKey = key;
      this.loadedReach = reach;
      this.build(this.centre[0], this.centre[1], reach, hero, true);
    } else if (key !== this.drawnKey) {
      this.drawnKey = key;
      if (this.laidHero) this.shift(this.laidHero, hero);
      else this.build(this.centre[0], this.centre[1], reach, hero, false);
    }
  }

  /** Lays marbles on the cells, each on its ground, in an instanced mesh (grown to hold them, up to `MOST`). */
  private place(mesh: THREE.InstancedMesh, cells: readonly Axial[]): void {
    const target = this.fit(mesh, Math.min(cells.length, MOST));
    const { dummy } = this;
    dummy.scale.set(1, 1, 1); // the shared holder may carry the height of the last column placed
    const drawn = Math.min(cells.length, target.instanceMatrix.count);
    for (let i = 0; i < drawn; i++) {
      const [q, r] = cells[i]!;
      const tile = this.world.tile(q, r)!;
      const p = axialTo3D(q, r);
      dummy.position.set(p.x, topOf(GROUND[tile.terrain], tile.height) + MARBLE, p.z);
      dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix);
    }
    target.count = drawn;
    target.instanceMatrix.needsUpdate = true;
  }

  /** The mesh that holds `needed` instances: `mesh` itself when it holds them, else a larger one (1.5 times its capacity at
   * least, never past `MOST`) that takes its place in the scene and in every reference. The old mesh's buffers are freed (#1010). */
  private fit(mesh: THREE.InstancedMesh, needed: number): THREE.InstancedMesh {
    if (needed <= mesh.instanceMatrix.count) return mesh;
    const capacity = Math.min(MOST, Math.max(needed, Math.ceil(mesh.instanceMatrix.count * 1.5)));
    return this.replace(mesh, mesh.geometry.clone(), capacity);
  }

  /** The mesh that takes the place of `mesh`, with `geometry` and `capacity` instances (#1010, #1017). It has a geometry and a material
   * of its own: three keeps the instance buffers of a mesh in its material's shader nodes and frees them with its geometry, so a
   * shared material or geometry would free buffers the mesh still draws. The replaced mesh, its geometry and its material are
   * retired until the next draw. */
  private replace(mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, capacity: number): THREE.InstancedMesh {
    const material = (mesh.material as THREE.Material).clone();
    const grown = new THREE.InstancedMesh(geometry, material, capacity);
    grown.name = mesh.name;
    grown.count = 0;
    grown.frustumCulled = false;
    grown.instanceColor = whiteColours(capacity); // the build writes every colour it places (#984)
    this.scene.remove(mesh);
    this.scene.add(grown);
    this.retire(mesh, mesh.geometry, mesh.material as THREE.Material);
    this.swap(mesh, grown);
    return grown;
  }

  /** Points every reference to `old` at `grown`: the grounds, the props, the troop, the enemies and the managed meshes. */
  private swap(old: THREE.InstancedMesh, grown: THREE.InstancedMesh): void {
    for (const ground of GROUNDS) {
      if (this.grounds[ground] === old) this.grounds[ground] = grown;
      if (this.flats[ground] === old) this.flats[ground] = grown;
    }
    for (const prop of PROP_NAMES) if (this.props[prop] === old) this.props[prop] = grown;
    if (this.troop === old) this.troop = grown;
    if (this.foes === old) this.foes = grown;
    for (const prop of MODELLED) if (this.detailed[prop] === old) this.detailed[prop] = grown;
    const at = this.managed.indexOf(old);
    if (at >= 0) this.managed[at] = grown;
  }

  /** The mesh a prop goes to: its detailed mesh within `HI_RADIUS` once its model is in, else its low-poly mesh. */
  private route(prop: Prop, near: boolean): THREE.InstancedMesh {
    return near && this.detailedReady.has(prop) ? this.detailed[prop]! : this.props[prop];
  }

  /** How many instances each managed mesh takes for the chunks `reach` around `(cx, cy)`. It runs the build's own `stand` and
   * routing, so a mesh is grown to hold them all before the build writes a single instance. */
  private need(cx: number, cy: number, reach: number, hero: Axial): Map<THREE.InstancedMesh, number> {
    const need = new Map<THREE.InstancedMesh, number>();
    const add = (mesh: THREE.InstancedMesh) => need.set(mesh, (need.get(mesh) ?? 0) + 1);
    const lay: Lay = (prop, near) => add(this.route(prop, near));
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        this.world.chunk(kx, ky).forEach((tile, i) => {
          const q = kx * CHUNK + (i % CHUNK);
          const r = ky * CHUNK + Math.floor(i / CHUNK);
          add(this.groundMesh(tile, q, r));
          this.stand(tile, q, r, NOWHERE, 0, lay, hexDistance([q, r], hero) <= HI_RADIUS);
        });
      }
    }
    return need;
  }

  /** The cell under a point of the screen, `x` and `y` from -1 to 1. The ray is cast against the top of each of the hero's cell and
   * its six neighbours, each on its own plane `y = topOf(cell)`, and a hit counts only where it lies in that cell. The nearest
   * hit to the camera wins. No hit gives the hero's own cell, so the click is no move (#988). */
  pick(x: number, y: number): Axial {
    this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
    const { ray } = this.raycaster;
    let best = this.heroCell;
    let nearest = Infinity;
    for (const cell of [this.heroCell, ...neighbours(this.heroCell)]) {
      const tile = this.world.tile(cell[0], cell[1]);
      if (!tile) continue;
      this.plane.set(this.up, -topOf(GROUND[tile.terrain], tile.height));
      if (!ray.intersectPlane(this.plane, this.ground)) continue;
      const [q, r] = cellAtPoint(this.ground.x, this.ground.z);
      if (q !== cell[0] || r !== cell[1]) continue; // the hit is in another cell
      const distance = this.ground.distanceToSquared(ray.origin);
      if (distance < nearest) {
        nearest = distance;
        best = cell;
      }
    }
    return best;
  }

  /** The cell under a point of the screen on the ground, near or far (#1137): the ray meets the plane of the hero's cell top, then
   * the plane of the top of the cell it fell in, three times over, so a hill or a lake settles on its own cell. `null` when the ray
   * misses the ground or lands off the loaded world. */
  pickGround(x: number, y: number): Axial | null {
    this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
    const { ray } = this.raycaster;
    let cell = this.heroCell;
    for (let i = 0; i < 3; i++) {
      const tile = this.world.tile(cell[0], cell[1]);
      if (!tile) return null;
      this.plane.set(this.up, -topOf(GROUND[tile.terrain], tile.height));
      if (!ray.intersectPlane(this.plane, this.ground)) return null;
      cell = cellAtPoint(this.ground.x, this.ground.z);
    }
    return cell;
  }

  /** Frees what a build or a model swap replaced, once the frame drawn after it is rendered (#1017): the frame in flight may still
   * use it. Called by the mode after each render. */
  drain(): void {
    for (const replaced of this.retired.splice(0)) replaced.dispose();
  }

  /** Holds a geometry or a mesh a build or a model swap replaced, until `drain` (#1017). */
  private retire(...replaced: { dispose(): void }[]): void {
    this.retired.push(...replaced);
  }

  /** Frees the GPU objects of the view: each geometry and material of its scene, once, and what it replaced and has not drained.
   * The view is not drawn after. */
  dispose(): void {
    this.drain();
    this.moves = [];
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      geometries.add((object as THREE.Mesh).geometry);
      materials.add((object as THREE.Mesh).material as THREE.Material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  /** Stands the landmark of each boss lair on its cell (#1170): `cells` in lair order, `beaten` the numbers of the lairs beaten. The
   * landmarks of an earlier call are replaced, and freed with the next draw. */
  setLairs(cells: readonly Axial[], beaten: readonly number[]): void {
    this.lairCells = cells;
    this.lairsBeaten = beaten;
    for (const old of this.scene.children.filter((child) => child.name.startsWith('lair-'))) {
      this.scene.remove(old);
      old.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (mesh.isMesh) this.retire(mesh.geometry, mesh.material as THREE.Material);
      });
    }
    cells.forEach(([q, r], i) => {
      const isBeaten = beaten.includes(i);
      const group = new THREE.Group();
      group.name = `lair-${i}`;
      const model = this.lairModels && (isBeaten ? this.lairModels.beaten : this.lairModels.open);
      if (model) {
        // The Blender landmark (#1171): painted by its vertex colours, gold gem while open, a green stump once beaten.
        group.add(new THREE.Mesh(model.clone(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true })));
      } else {
        const colour = isBeaten ? LAIR_LOOK.beaten : LAIR_LOOK.open;
        const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.6, roughness: 0.5 });
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, LAIR_LOOK.height, 6), material);
        pillar.position.y = LAIR_LOOK.height / 2;
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 6), material);
        plinth.position.y = 0.075;
        group.add(pillar, plinth);
      }
      const p = axialTo3D(q, r);
      const tile = this.world.tile(q, r)!;
      group.position.set(p.x, topOf(GROUND[tile.terrain], tile.height), p.z);
      this.scene.add(group);
    });
  }

  /** Lays the enemy marbles of the loaded chunks as the fight has them now: the generated ones not moved, and the pushed ones.
   * A push calls it again, the chunks stay as they are. */
  updateEnemies(): void {
    const { enemyCells } = this;
    enemyCells.length = 0;
    const [cx, cy] = this.centre;
    const reach = this.loadedReach;
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        for (const cell of this.fight.chunkEnemies(this.world, kx, ky)) enemyCells.push(cell);
      }
    }
    this.place(this.foes, enemyCells);
    this.enemyCount = this.foes.count;
  }

  /** The meshes a build lays: every managed mesh, or with `terrain` false the props only. The ground columns do not depend on the
   * hero, and neither do the enemies, so a step keeps their instances as they are (#1034). */
  private laid(terrain: boolean): THREE.InstancedMesh[] {
    return this.managed.filter((mesh) => terrain || !GROUNDS.some((ground) => this.grounds[ground] === mesh || this.flats[ground] === mesh));
  }

  /** Lays the chunks `reach` around `(cx, cy)`: the ground columns, the props (the detailed ones within `HI_RADIUS` of `hero`) and
   * the enemies. With `terrain` false (a step within the same chunks) it lays the props alone. */
  private build(cx: number, cy: number, reach: number, hero: Axial, terrain: boolean): void {
    const need = this.need(cx, cy, reach, hero);
    for (const mesh of this.laid(terrain)) this.fit(mesh, need.get(mesh) ?? 0); // every mesh holds what this build writes
    const counts = new Map<THREE.InstancedMesh, number>();
    const { dummy } = this;
    // Writes the next instance of `mesh` (it holds them all: `fit`).
    const put = (mesh: THREE.InstancedMesh, x: number, y: number, z: number, scaleY: number, colour: number) => {
      const n = counts.get(mesh) ?? 0;
      dummy.position.set(x, y, z);
      dummy.scale.set(1, scaleY, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, this.colour.set(colour));
      counts.set(mesh, n + 1);
    };
    // The props are laid by their cell too, so a step can move one of them (`slots`, #1054).
    this.slots.clear();
    for (const mesh of this.propMeshes()) this.slots.set(mesh, { cells: [], at: new Map() });
    let cell = 0;
    const lay: Lay = (prop, near, x, y, z, scaleY, colour) => {
      const mesh = this.route(prop, near);
      put(mesh, x, y, z, scaleY, colour);
      const slots = this.slots.get(mesh)!;
      slots.at.set(cell, slots.cells.length);
      slots.cells.push(cell);
    };
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        this.world.chunk(kx, ky).forEach((tile, i) => {
          const q = kx * CHUNK + (i % CHUNK);
          const r = ky * CHUNK + Math.floor(i / CHUNK);
          const p = axialTo3D(q, r);
          const ground = GROUND[tile.terrain];
          const top = topOf(ground, tile.height);
          if (terrain) {
            const column = this.groundMesh(tile, q, r);
            put(column, p.x, top / 2, p.z, top, groundColour(tile, ground));
            if (ground === 'water') column.setColorAt(counts.get(column)! - 1, waterColor(this.world, q, r));
          }
          cell = cellKey(q, r);
          this.stand(tile, q, r, p, top, lay, hexDistance([q, r], hero) <= HI_RADIUS);
        });
      }
    }
    if (terrain) this.updateEnemies();
    for (const mesh of this.laid(terrain)) {
      mesh.count = counts.get(mesh) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    this.laidHero = hero;
  }

  /** Draws the ground as flat tops where a column shows no side (`useFlatTops`), at the next frame. */
  useFlatTops(on: boolean): void {
    if (on === this.flatTops) return;
    this.flatTops = on;
    this.drawnChunks = ''; // the ground is laid again
  }

  /** The mesh of a ground cell: its column, or, on the low tier, its flat top when no neighbour lies below it. A neighbour off the
   * world counts as below: the edge of the world keeps its sides. */
  private groundMesh(tile: Tile, q: number, r: number): THREE.InstancedMesh {
    const ground = GROUND[tile.terrain];
    if (!this.flatTops) return this.grounds[ground];
    const top = topOf(ground, tile.height);
    const hidden = neighbours([q, r]).every(([nq, nr]) => {
      const next = this.world.tile(nq, nr);
      return next !== undefined && topOf(GROUND[next.terrain], next.height) >= top;
    });
    return hidden ? this.flats[ground] : this.grounds[ground];
  }

  /** The props' meshes: the low-poly mesh of each prop, and the detailed mesh of each modelled prop. */
  private propMeshes(): THREE.InstancedMesh[] {
    return [...PROP_NAMES.map((prop) => this.props[prop]), ...MODELLED.map((prop) => this.detailed[prop]!)];
  }

  /** A step from the cell `from` to `to` moves only the props whose detail changes: the cells within `HI_RADIUS` of exactly one of
   * the two (#1054). Each leaving cell goes back to its low-poly mesh, each entering one to its detailed mesh; the other props keep
   * their instances. The chunks are the ones the props are laid on: `frame` rebuilds them when they change. */
  private shift(from: Axial, to: Axial): void {
    eachNear(from, (cell) => {
      if (hexDistance(cell, to) > HI_RADIUS) this.moveProp(cell, false);
    });
    eachNear(to, (cell) => {
      if (hexDistance(cell, from) > HI_RADIUS) this.moveProp(cell, true);
    });
    this.laidHero = to;
  }

  /** Moves the prop of `cell` to the mesh of its new detail, `near` or not, when its prop changes mesh. A cell off the world has no
   * tile, and a cell of another terrain no prop: neither is laid. Every cell within `HI_RADIUS` is loaded (`frame`). */
  private moveProp(cell: Axial, near: boolean): void {
    const [q, r] = cell;
    const tile = this.world.tile(q, r);
    const prop = tile && PROP_OF[tile.terrain];
    if (!tile || !prop) return;
    const from = this.route(prop, !near);
    const to = this.route(prop, near);
    if (from === to) return; // not detailed yet: the mesh stays the low-poly one
    const key = cellKey(q, r);
    this.removeProp(from, key);
    const spot = { x: 0, y: 0, z: 0, scaleY: 0, colour: WHITE };
    this.stand(tile, q, r, axialTo3D(q, r), topOf(GROUND[tile.terrain], tile.height), (name, _near, x, y, z, scaleY, colour) => {
      if (name !== prop) return; // a wall's cap stays where it is
      Object.assign(spot, { x, y, z, scaleY, colour });
    }, near);
    this.addProp(to, key, spot);
  }

  /** Takes the instance of the cell `key` out of a props mesh: its last instance takes its place, the count drops by one (#1054). */
  private removeProp(mesh: THREE.InstancedMesh, key: number): void {
    const slots = this.slots.get(mesh)!;
    const at = slots.at.get(key)!;
    const last = slots.cells.length - 1;
    const moved = slots.cells.pop()!;
    if (at !== last) {
      mesh.instanceMatrix.array.copyWithin(at * 16, last * 16, last * 16 + 16);
      mesh.instanceColor!.array.copyWithin(at * 3, last * 3, last * 3 + 3);
      slots.cells[at] = moved;
      slots.at.set(moved, at);
    }
    slots.at.delete(key);
    this.written(mesh, last);
  }

  /** Puts a cell's prop at the end of a props mesh, at `spot` (its place, size and colour as `stand` lays it). A full mesh grows first
   * (`grow`), up to `MOST`. */
  private addProp(mesh: THREE.InstancedMesh, key: number, spot: { x: number; y: number; z: number; scaleY: number; colour: number }): void {
    const target = mesh.instanceMatrix.count > this.slots.get(mesh)!.cells.length ? mesh : this.grow(mesh);
    const slots = this.slots.get(target)!;
    const n = slots.cells.length;
    const { dummy } = this;
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(1, spot.scaleY, 1);
    dummy.updateMatrix();
    target.setMatrixAt(n, dummy.matrix);
    target.setColorAt(n, this.colour.set(spot.colour));
    slots.at.set(key, n);
    slots.cells.push(key);
    this.written(target, n + 1);
  }

  /** Sets a props mesh's count to `count` and flags its instances to upload (#1054). */
  private written(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }

  /** The mesh that takes the place of a full props mesh: a larger one holding the instances it had, at the same indices, so its
   * slots carry over (#1054). The replaced mesh is retired like a build's (`replace`). */
  private grow(mesh: THREE.InstancedMesh): THREE.InstancedMesh {
    const n = mesh.count;
    const slots = this.slots.get(mesh)!;
    const capacity = Math.min(MOST, Math.max(n + 1, Math.ceil(mesh.instanceMatrix.count * 1.5)));
    const grown = this.replace(mesh, mesh.geometry.clone(), capacity);
    grown.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, n * 16));
    grown.instanceColor!.array.set(mesh.instanceColor!.array.subarray(0, n * 3));
    this.slots.delete(mesh);
    this.slots.set(grown, slots);
    this.written(grown, n);
    return grown;
  }

  /** The prop a tile carries on its ground, `top` high, tinted by its biome when it is a tree or a boulder. */
  private stand(tile: Tile, q: number, r: number, p: { x: number; z: number }, top: number, lay: Lay, near: boolean): void {
    const v = variety(q, r);
    const tint = BIOME_LOOK[tile.biome].prop;
    if (tile.terrain === 'peak') lay('mountain', near, p.x, top + (1.2 + v * 0.8) / 2, p.z, 1.2 + v * 0.8, WHITE);
    else if (tile.terrain === 'tree') lay('tree', near, p.x, top + (0.8 + v * 0.4) / 2, p.z, 0.8 + v * 0.4, tint);
    else if (tile.terrain === 'boulder') lay('boulder', near, p.x, top + 0.2, p.z, 0.8, tint);
    else if (tile.terrain === 'wall') {
      lay('wall', near, p.x, top + WALL / 2, p.z, WALL, WHITE);
      lay('cap', false, p.x, top + WALL + CAP / 2, p.z, CAP, WHITE);
    }
  }
}
