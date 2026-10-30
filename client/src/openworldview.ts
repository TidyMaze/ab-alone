// The Open world on screen (docs/specs/openworld.md section 2): the chunks around the hero drawn as columns of hex
// prisms, lifted by their height and coloured by their terrain, with low-poly props on top (faceted mountains, wire
// pines, boulders, gantry walls with a gold edge), the hero marble, and the camera that follows it. It has its own
// scene, drawn by the page's renderer while the mode is on. Relief and terrain are looks only.
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { type Biome, CHUNK, cellAtPoint, chunkOf, neighbours, TROOP, type Terrain, type Tile, type World } from './openworld';

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

/** Puts the camera `k` zooms up and back from `at` (the point it looks at, the hero's column top when eased), looking down
 * at it, and the planes of the camera with the zoom. */
function lookAtHero(camera: THREE.PerspectiveCamera, at: THREE.Vector3, k: number): void {
  const distance = CAMERA_DISTANCE * k;
  camera.position.set(at.x, at.y + distance * Math.cos(TILT), at.z + distance * Math.sin(TILT));
  camera.up.set(0, 0, -1); // screen up is the far side: the default up at the closest view, defined straight down
  camera.lookAt(at);
  camera.near = NEAR * k; // scales with the zoom: the depth precision is the same at every zoom
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** The reach of the loaded chunks at the zoom `k` on a screen of `aspect`: the hero is the centre, so its cell is the origin. */
export function reachAt(aspect: number, k: number): number {
  const probe = new THREE.PerspectiveCamera(40, aspect, NEAR, CAMERA_FAR);
  const origin = new THREE.Vector3();
  lookAtHero(probe, origin, k);
  return reachFor(groundRadius(probe, origin));
}

/** The largest zoom on a screen of `aspect` whose reach stays within `MAX_REACH`: `MAX_ZOOM`, or lower where a wide screen would
 * pass it (it sees more ground). The zoom never goes further, so the loaded chunks always cover the ground in view (#976). */
export function maxZoomFor(aspect: number): number {
  if (reachAt(aspect, MAX_ZOOM) <= MAX_REACH) return MAX_ZOOM;
  let low = 1;
  let high = MAX_ZOOM;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (reachAt(aspect, mid) <= MAX_REACH) low = mid;
    else high = mid;
  }
  return low;
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
export const LOOK: Record<Ground, { color: number; emissive: number }> = {
  water: { color: 0xffffff, emissive: 0x0a5568 }, // coolant lakes glow a little; the colour comes per cell (waterColor)
  sand: { color: 0x9a8a62, emissive: 0x000000 },
  grass: { color: 0x3f7d5f, emissive: 0x000000 },
  rock: { color: 0x4b525c, emissive: 0x000000 },
  peak: { color: 0x4a525c, emissive: 0x000000 },
};
/** The lake colours: the shore, lighter and greener, and the deep middle of a lake. */
export const WATER = { shore: 0x3fd0b4, deep: 0x0a4a7a };
/** The looks of the biomes (openworld-terrain.md section 4): the ground of the low grass (heights 3 and 4), and the tint of the
 * trees and the boulders, multiplied into their colour per instance. The meadow keeps the grass of `LOOK`; the rest is neutral
 * white. Shore, uplands, peaks and water keep their colours in every biome. */
export const BIOME_LOOK: Record<Biome, { ground: number; prop: number }> = {
  meadow: { ground: 0x3f7d5f, prop: 0xffffff },
  forest: { ground: 0x2b6a48, prop: 0xffffff },
  tundra: { ground: 0xe6eef2, prop: 0xe4f0f8 },
  desert: { ground: 0xc9a062, prop: 0xffd39a },
  badlands: { ground: 0x7a3a2c, prop: 0xff9f7a },
};
/** The colour of a cell's ground, per instance: the low grass by its biome, every other ground by `LOOK` (the water's colour
 * comes from `waterColor`). */
export const groundColour = (tile: Tile, ground: Ground): number =>
  ground === 'grass' && (tile.height === 3 || tile.height === 4) ? BIOME_LOOK[tile.biome].ground : LOOK[ground].color;
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
  cap: { geometry: new THREE.CylinderGeometry(0.52, 0.52, 1, 6), color: 0xe6a06a, emissive: 0x7a4a1e, flat: false },
} as const;
type Prop = keyof typeof PROPS;
const PROP_NAMES = Object.keys(PROPS) as Prop[];
/** The props that have a model in Blender: the low-poly one in `client/models/openworld.glb` (`ow_<prop>`) and the detailed one
 * in `openworld-hi.glb` (`ow_<prop>_hi`), drawn near the hero (#989). */
const MODELLED = ['mountain', 'tree', 'boulder', 'wall'] as const;
export type PropGeometries = Partial<Record<Prop, THREE.BufferGeometry>>;
/** The geometries of both sets of models: `low` the low-poly props, `high` the detailed ones. */
export type PropModels = { low: PropGeometries; high: PropGeometries };
export type ModelUrls = { low: string; high: string };

/** The geometries of the models named `ow_<prop><suffix>` in the glTF at `url`; a failed load gives none, the procedural shapes stay. */
async function readModels(url: string, loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> }, suffix: string): Promise<PropGeometries> {
  try {
    const { scene } = await loader.loadAsync(url);
    const out: PropGeometries = {};
    for (const prop of MODELLED) {
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
  const [low, high] = await Promise.all([readModels(urls.low, loader, ''), readModels(urls.high, loader, '_hi')]);
  return { low, high };
}

/** A detailed mesh holds the cells within `HI_RADIUS` of the hero: 3r(r+1)+1 of them, the most a build puts in one. */
export const HI_RADIUS = 8;
export const HI_CAPACITY = 3 * HI_RADIUS * (HI_RADIUS + 1) + 1;

const RADIUS = 0.56; // a hex of side 0.56 tiles a grid of spacing 1 with a thin gap
const MARBLE = 0.3;
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

/** A stable 0 to 1 draw per cell, so the mountains and the trees differ in height but never change between draws. */
export const variety = (q: number, r: number): number => (((Math.imul(q, 73856093) ^ Math.imul(r, 19349663)) >>> 0) % 100) / 100;

/** The material of a prop's mesh: its look, the same for its low-poly and its detailed mesh. */
const propMaterial = (prop: Prop): THREE.MeshStandardMaterial => {
  const { color, emissive, flat } = PROPS[prop];
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.8, flatShading: flat });
};
/** The instance colours of a mesh of `capacity` instances, all white: the colour of an instance a build does not set. */
const whiteColours = (capacity: number): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
/** The writer of a build's props: a prop of a cell (`near`: within `HI_RADIUS`). */
type Lay = (prop: Prop, near: boolean, x: number, y: number, z: number, scaleY: number, colour: number) => void;
/** The colour that leaves an instance as its mesh's material has it (no tint). */
const WHITE = 0xffffff;
/** A cell with no height: the props of a count are laid at no place, so the position they are given is never read. */
const NOWHERE = { x: 0, z: 0 };

export class OpenWorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, NEAR, CAMERA_FAR);
  private readonly fog = new THREE.Fog(0x0b1220);
  private level = 1;
  /** The widest zoom on the screen's aspect, see `maxZoomFor`. */
  private limit = maxZoomFor(1);
  /** The chunk the hero is in, and the key of the chunks drawn: rebuilt when either changes. */
  private centre: Axial = [0, 0];
  private drawnKey = '';
  private loadedReach = 0;
  private readonly grounds = {} as Record<Ground, THREE.InstancedMesh>;
  private readonly props = {} as Record<Prop, THREE.InstancedMesh>;
  /** The detailed meshes of the modelled props, and the props whose detailed model has arrived: only those draw near the hero. */
  private readonly detailed: Partial<Record<Prop, THREE.InstancedMesh>> = {};
  private readonly detailedReady = new Set<Prop>();
  /** The meshes a build lays: the ground columns, the props and the detailed props. */
  private readonly managed: THREE.InstancedMesh[] = [];
  private readonly hero: THREE.Mesh;
  /** The cell the hero is on, the centre of the pick. */
  private heroCell: Axial = [0, 0];
  /** The point the camera looks at: the hero's x and z, its height eased to the hero's column top (#988). The first show puts it
   * there at once (`placed`): the camera does not glide in from the origin. */
  private readonly focus = new THREE.Vector3();
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

  constructor(private readonly world: World) {
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = this.fog;
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2418, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-6, 12, 4);
    this.scene.add(sun);
    const prism = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6);
    for (const ground of GROUNDS) {
      const { emissive } = LOOK[ground];
      // The colour comes per instance (groundColour), so the material is white: the water's way too.
      this.grounds[ground] = this.instances(`terrain-${ground}`, CAPACITY[ground], prism, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive, roughness: 0.9 }));
      this.managed.push(this.grounds[ground]);
    }
    (this.grounds.water.material as THREE.MeshStandardMaterial).roughness = 0.2; // a glossy surface catches the sun
    for (const prop of PROP_NAMES) {
      this.props[prop] = this.instances(`prop-${prop}`, CAPACITY[prop], PROPS[prop].geometry, propMaterial(prop));
      this.managed.push(this.props[prop]);
    }
    for (const prop of MODELLED) {
      this.detailed[prop] = this.instances(`prop-${prop}-hi`, HI_CAPACITY, PROPS[prop].geometry, propMaterial(prop));
      this.managed.push(this.detailed[prop]!);
    }
    this.hero = new THREE.Mesh(new THREE.SphereGeometry(MARBLE, 24, 16), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.1 }));
    this.hero.name = 'hero';
    this.scene.add(this.hero);
    const marble = new THREE.SphereGeometry(MARBLE, 16, 12);
    this.troop = this.instances('troop', CAPACITY.troop, marble, new THREE.MeshStandardMaterial({ color: 0x8fc4f5, roughness: 0.2 }));
    this.foes = this.instances('enemies', CAPACITY.enemies, marble, new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.25 }));
  }

  /** An instanced mesh of `capacity` instances, each with its own colour (3 floats, white until a build sets it, #984). */
  private instances(name: string, capacity: number, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
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
    this.drawnKey = '';
    this.frame();
  }

  /** Gives a prop's mesh a model's geometry. A model that paints itself (vertex colours from Blender) is drawn as painted: no tint
   * hides it. */
  private paint(mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry): void {
    mesh.geometry = geometry;
    if (geometry.hasAttribute('color')) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.vertexColors = true;
      material.color.set(0xffffff);
      material.emissive.set(0x000000);
      material.needsUpdate = true;
    }
  }

  /** A new screen size: the aspect changes the ground in view, so the widest zoom and the loaded chunks follow (#976). */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.limit = maxZoomFor(this.camera.aspect);
    this.level = Math.min(this.level, this.limit);
    this.frame();
  }

  /** The widest zoom on this screen: a wide screen stops sooner, so the loaded chunks always cover the ground in view. */
  get maxZoom(): number {
    return this.limit;
  }

  /** Whether a lake is drawn, so its glow moves. */
  get hasWater(): boolean {
    return this.grounds.water.count > 0;
  }

  /** The glow of the water breathes slowly: `ms` is the time, 0 holds it still (reduced motion). */
  glow(ms: number): void {
    (this.grounds.water.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + 0.15 * Math.sin(ms / 1200);
  }

  /** Draws the world around the hero at `at`: the chunks are rebuilt when the hero enters another chunk, the hero and the
   * camera follow every step. */
  show(at: Axial, troop: readonly Axial[] = []): void {
    const tile = this.world.tile(at[0], at[1])!;
    const p = axialTo3D(at[0], at[1]);
    const top = topOf(GROUND[tile.terrain], tile.height) + MARBLE;
    this.centre = chunkOf(at);
    this.heroCell = [at[0], at[1]];
    this.hero.position.set(p.x, top, p.z);
    this.focus.x = p.x;
    this.focus.z = p.z;
    if (!this.placed) {
      this.focus.y = top;
      this.placed = true;
    }
    this.place(this.troop, troop);
    this.frame();
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

  /** The chunks on each side of the hero's chunk that are drawn: they follow the zoom (#976). */
  get reach(): number {
    return this.loadedReach;
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

  /** Puts the camera at the zoom's distance from the hero, looking down at it, and the fog and the planes of the camera with
   * the zoom. The chunks loaded follow the ground the camera sees: rebuilt when the hero's chunk or the reach changes. */
  private frame(): void {
    const k = this.level;
    const at = this.focus;
    lookAtHero(this.camera, at, k);
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
    const key = `${this.centre},${reach},${hero}`; // the hero's cell too: it sets which props are detailed (#989)
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.loadedReach = reach;
      this.build(this.centre[0], this.centre[1], reach, hero);
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
    const grown = new THREE.InstancedMesh(mesh.geometry, mesh.material, capacity);
    grown.name = mesh.name;
    grown.count = 0;
    grown.frustumCulled = false;
    grown.instanceColor = whiteColours(capacity); // the build writes every colour it places (#984)
    this.scene.remove(mesh);
    this.scene.add(grown);
    mesh.dispose();
    this.swap(mesh, grown);
    return grown;
  }

  /** Points every reference to `old` at `grown`: the grounds, the props, the troop, the enemies and the managed meshes. */
  private swap(old: THREE.InstancedMesh, grown: THREE.InstancedMesh): void {
    for (const ground of GROUNDS) if (this.grounds[ground] === old) this.grounds[ground] = grown;
    for (const prop of PROP_NAMES) if (this.props[prop] === old) this.props[prop] = grown;
    if (this.troop === old) this.troop = grown;
    if (this.foes === old) this.foes = grown;
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
          add(this.grounds[GROUND[tile.terrain]]);
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

  /** Frees the GPU objects of the view: each geometry and material of its scene, once. The view is not drawn after. */
  dispose(): void {
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

  /** Lays the chunks `reach` around `(cx, cy)`: the ground columns, the props (the detailed ones within `HI_RADIUS` of `hero`) and
   * the enemies. */
  private build(cx: number, cy: number, reach: number, hero: Axial): void {
    const need = this.need(cx, cy, reach, hero);
    for (const mesh of [...this.managed]) this.fit(mesh, need.get(mesh) ?? 0); // every mesh holds what this build writes
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
    const lay: Lay = (prop, near, x, y, z, scaleY, colour) => put(this.route(prop, near), x, y, z, scaleY, colour);
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        this.world.chunk(kx, ky).forEach((tile, i) => {
          const q = kx * CHUNK + (i % CHUNK);
          const r = ky * CHUNK + Math.floor(i / CHUNK);
          const p = axialTo3D(q, r);
          const ground = GROUND[tile.terrain];
          const top = topOf(ground, tile.height);
          put(this.grounds[ground], p.x, top / 2, p.z, top, groundColour(tile, ground));
          if (ground === 'water') this.grounds.water.setColorAt(counts.get(this.grounds.water)! - 1, waterColor(this.world, q, r));
          this.stand(tile, q, r, p, top, lay, hexDistance([q, r], hero) <= HI_RADIUS);
        });
      }
    }
    const { enemyCells } = this;
    enemyCells.length = 0;
    for (let ky = cy - reach; ky <= cy + reach; ky++) {
      for (let kx = cx - reach; kx <= cx + reach; kx++) {
        for (const cell of this.world.enemies(kx, ky)) enemyCells.push(cell);
      }
    }
    this.place(this.foes, enemyCells);
    this.enemyCount = this.foes.count;
    for (const mesh of this.managed) {
      mesh.count = counts.get(mesh) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
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
