// The Open world on screen (docs/specs/openworld.md section 2): the chunks around the hero drawn as columns of hex
// prisms, lifted by their height and coloured by their terrain, with low-poly props on top (faceted mountains, wire
// pines, boulders, gantry walls with a gold edge), the hero marble, and the camera that follows it. It has its own
// scene, drawn by the page's renderer while the mode is on. Relief and terrain are looks only.
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, cellAtPoint, chunkOf, neighbours, TERRAINS, type Terrain, type Tile, type World } from './openworld';
import { Overview, SIDE } from './openworldoverview';

/** Chunks loaded on each side of the hero's chunk. */
const REACH = 2;
const CAPACITY = (2 * REACH + 1) ** 2 * CHUNK * CHUNK;
/** The closest camera: up and back from the hero. The zoom multiplies both, the distance from the hero with them. */
const CAMERA_UP = 14;
const CAMERA_BACK = 11;
const CAMERA_DISTANCE = Math.hypot(CAMERA_UP, CAMERA_BACK);
/** The tilt of the camera from straight down, at the closest view. */
const TILT = Math.atan2(CAMERA_BACK, CAMERA_UP);
/** The fog closes in from the camera, and the far plane of the camera stops past it; both scale with the zoom (#976). */
const FOG_NEAR = 18;
const FOG_FAR = 34;
const CAMERA_FAR = 80;
const NEAR = 0.1;
/** Up to this zoom the camera flies over the real chunks; past it the overview takes over, the chunks hidden (#976). */
export const CLOSE_RANGE = 2.5;
/** The widest zoom: the camera high enough that the whole world (SIDE cells a side) is in view from any cell of a 16:9
 * screen. At CAMERA_DISTANCE * MAX_ZOOM, about 2850 up, the 40 degree field of view covers about 2070 cells high and 3700
 * wide, more than the SIDE of 1024. */
export const MAX_ZOOM = 160;
const OVERVIEW_NEAR = 5;
const OVERVIEW_FAR = 8000;
/** The hero's dot on the overview: its radius, a fraction of the camera distance, at least one cell. */
const DOT_RATIO = 0.006;

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
/** The props that have a low-poly model in `client/models/openworld.glb`, made in Blender, each mesh named `ow_<prop>`. */
const MODELLED = ['mountain', 'tree', 'boulder', 'wall'] as const;
export type PropGeometries = Partial<Record<Prop, THREE.BufferGeometry>>;

/** The geometries of the models in the glTF at `url`; a failed load gives none, the procedural shapes stay. */
export async function loadModels(url: string, loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D }> }): Promise<PropGeometries> {
  try {
    const { scene } = await loader.loadAsync(url);
    const out: PropGeometries = {};
    for (const prop of MODELLED) {
      const mesh = scene.getObjectByName(`ow_${prop}`) as THREE.Mesh | undefined;
      if (mesh) out[prop] = mesh.geometry;
    }
    return out;
  } catch {
    return {};
  }
}

const RADIUS = 0.56; // a hex of side 0.56 tiles a grid of spacing 1 with a thin gap
const MARBLE = 0.3;
const WALL = 0.9;
const CAP = 0.07;

/** The height of the top of a cell's ground: water lies low. */
export const topOf = (terrain: Terrain, height: number): number => (terrain === 'water' ? 0.08 : 0.2 + 0.2 * height);

/** A stable 0 to 1 draw per cell, so the mountains and the trees differ in height but never change between draws. */
export const variety = (q: number, r: number): number => (((Math.imul(q, 73856093) ^ Math.imul(r, 19349663)) >>> 0) % 100) / 100;

/** The colours of the overview by terrain code: 4 bytes a code, the colour of its ground (a boulder is rock, a tree grass). */
export function overviewPalette(): Uint8Array {
  const palette = new Uint8Array(TERRAINS.length * 4);
  TERRAINS.forEach((terrain, code) => {
    const hex = LOOK[GROUND[terrain]].color;
    palette.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], code * 4);
  });
  return palette;
}

export class OpenWorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, NEAR, CAMERA_FAR);
  private readonly fog = new THREE.Fog(0x0b1220, FOG_NEAR, FOG_FAR);
  private level = 1;
  /** The overview's objects, in a group of their own: the close range's objects are hidden while it shows. */
  private readonly overviewGroup = new THREE.Group();
  private overlay: { field: Overview; plane: THREE.Mesh; dot: THREE.Mesh } | null = null;
  private overviewOn = false;
  private at: Axial = [0, 0];
  private readonly grounds = {} as Record<Ground, THREE.InstancedMesh>;
  private readonly props = {} as Record<Prop, THREE.InstancedMesh>;
  private readonly hero: THREE.Mesh;
  private readonly troop: THREE.InstancedMesh;
  private readonly foes: THREE.InstancedMesh;
  private region = '';
  /** The enemy marbles drawn around the hero. */
  enemyCount = 0;

  /** `load` gives the raw bytes of a chunk for the overview, which paints from them and not through the world. */
  constructor(
    private readonly world: World,
    private readonly load: (cx: number, cy: number) => Uint8Array = () => new Uint8Array(),
  ) {
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = this.fog;
    this.overviewGroup.name = 'overview';
    this.overviewGroup.visible = false;
    this.scene.add(this.overviewGroup);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2418, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-6, 12, 4);
    this.scene.add(sun);
    const prism = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6);
    for (const ground of GROUNDS) {
      const { color, emissive } = LOOK[ground];
      this.grounds[ground] = this.instances(`terrain-${ground}`, prism, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.9 }));
    }
    (this.grounds.water.material as THREE.MeshStandardMaterial).roughness = 0.2; // a glossy surface catches the sun
    for (const prop of PROP_NAMES) {
      const { geometry, color, emissive, flat } = PROPS[prop];
      this.props[prop] = this.instances(`prop-${prop}`, geometry, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.8, flatShading: flat }));
    }
    this.hero = new THREE.Mesh(new THREE.SphereGeometry(MARBLE, 24, 16), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.1 }));
    this.hero.name = 'hero';
    this.scene.add(this.hero);
    const marble = new THREE.SphereGeometry(MARBLE, 16, 12);
    this.troop = this.instances('troop', marble, new THREE.MeshStandardMaterial({ color: 0x8fc4f5, roughness: 0.2 }));
    this.foes = this.instances('enemies', marble, new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.25 }));
  }

  private instances(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.count = 0;
    mesh.frustumCulled = false; // its bounds come from the first instances, the fog hides the rest
    mesh.name = name;
    this.scene.add(mesh);
    return mesh;
  }

  /** Swaps the procedural shapes for the models; the next chunk build draws them. */
  useModels(geometries: PropGeometries): void {
    for (const prop of PROP_NAMES) {
      const geometry = geometries[prop];
      if (!geometry) continue;
      this.props[prop].geometry = geometry;
      if (geometry.hasAttribute('color')) {
        // a model that paints itself (vertex colours from Blender): drawn as painted, no tint hides it
        const material = this.props[prop].material as THREE.MeshStandardMaterial;
        material.vertexColors = true;
        material.color.set(0xffffff);
        material.emissive.set(0x000000);
        material.needsUpdate = true;
      }
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    const [cx, cy] = chunkOf(at);
    const region = `${cx},${cy}`;
    if (region !== this.region) {
      this.region = region;
      this.build(cx, cy);
    }
    const tile = this.world.tile(at[0], at[1])!;
    const p = axialTo3D(at[0], at[1]);
    this.hero.position.set(p.x, topOf(GROUND[tile.terrain], tile.height) + MARBLE, p.z);
    this.place(this.troop, troop);
    this.at = at;
    this.frame();
  }

  /** The zoom of the camera: 1 is the closest view, `MAX_ZOOM` the widest. */
  get zoom(): number {
    return this.level;
  }

  /** Zooms the camera by `scale`, more than 1 further out and less than 1 closer, between the closest view and the widest. */
  zoomBy(scale: number): void {
    this.level = Math.min(MAX_ZOOM, Math.max(1, this.level * scale));
    this.frame();
  }

  /** Whether the overview is on: past the close range. */
  get overview(): boolean {
    return this.level > CLOSE_RANGE;
  }

  /** Paints up to `max` chunks of the overview, nearest the hero first, while it is on; reports whether it painted any. */
  paintOverview(max: number): boolean {
    if (!this.overviewOn) return false;
    const [cx, cy] = chunkOf(this.at);
    return this.overlay!.field.paint(cx, cy, max);
  }

  /** Frees what the overview made: its texture, its plane and material, and the hero's dot. */
  disposeOverview(): void {
    this.showOverview(false);
    if (!this.overlay) return;
    const { field, plane, dot } = this.overlay;
    this.overviewGroup.remove(plane, dot);
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
    dot.geometry.dispose();
    (dot.material as THREE.Material).dispose();
    field.dispose();
    this.overlay = null;
  }

  /** Puts the camera at the zoom's distance from the hero and the fog and the far plane with it. Past the close range the
   * camera tilts from the closest view's tilt to straight down at the widest zoom, and looks down at the hero. */
  private frame(): void {
    const k = this.level;
    const overview = this.overview;
    // The tilt eases with the logarithm of the zoom, as the zoom itself grows: straight down at the widest view.
    const tilt = overview ? TILT * (1 - Math.log(k / CLOSE_RANGE) / Math.log(MAX_ZOOM / CLOSE_RANGE)) : TILT;
    const distance = CAMERA_DISTANCE * k;
    const at = this.hero.position;
    this.showOverview(overview);
    this.camera.position.set(at.x, distance * Math.cos(tilt), at.z + distance * Math.sin(tilt));
    this.camera.up.set(0, 0, -1); // screen up is the far side: the default up at the closest view, defined straight down
    this.camera.lookAt(at);
    this.camera.far = overview ? OVERVIEW_FAR : CAMERA_FAR * k;
    this.camera.updateProjectionMatrix();
    this.fog.near = FOG_NEAR * k;
    this.fog.far = FOG_FAR * k;
    if (overview) {
      this.overlay!.dot.position.set(at.x, 0.5, at.z);
      this.overlay!.dot.scale.setScalar(Math.max(1, distance * DOT_RATIO));
    }
    this.camera.updateMatrixWorld();
  }

  /** Switches between the close range (the chunks, the props, the marbles, the fog) and the overview, a hard switch at the
   * close range's last view: the close range's objects are hidden while the overview shows, and the fog goes with them. */
  private showOverview(on: boolean): void {
    if (on === this.overviewOn) return;
    this.overviewOn = on;
    if (on && !this.overlay) this.overlay = this.makeOverlay();
    this.overviewGroup.visible = on;
    for (const o of this.scene.children) if (o !== this.overviewGroup && !(o instanceof THREE.Light)) o.visible = !on;
    this.scene.fog = on ? null : this.fog;
    this.camera.near = on ? OVERVIEW_NEAR : NEAR;
  }

  /** The overview's plane, the world's square of cells laid on the ground as the hex grid lays them, the texture on it, and
   * the hero's dot. */
  private makeOverlay(): { field: Overview; plane: THREE.Mesh; dot: THREE.Mesh } {
    const field = new Overview(this.load, overviewPalette());
    const half = SIDE / 2;
    const corners: [number, number][] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
    const position: number[] = [];
    const uv: number[] = [];
    for (const [q, r] of corners) {
      const p = axialTo3D(q, r);
      position.push(p.x, 0, p.z);
      uv.push((q + half) / SIDE, (r + half) / SIDE);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex([0, 2, 1, 0, 3, 2]); // facing up
    const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: field.texture }));
    plane.name = 'overview-plane';
    plane.frustumCulled = false;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
    dot.name = 'overview-hero';
    dot.frustumCulled = false;
    this.overviewGroup.add(plane, dot);
    return { field, plane, dot };
  }

  /** Lays marbles on the cells, each on its ground, in an instanced mesh. */
  private place(mesh: THREE.InstancedMesh, cells: readonly Axial[]): void {
    const dummy = new THREE.Object3D();
    cells.forEach(([q, r], i) => {
      const tile = this.world.tile(q, r)!;
      const p = axialTo3D(q, r);
      dummy.position.set(p.x, topOf(GROUND[tile.terrain], tile.height) + MARBLE, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** The cell under a point of the screen, `x` and `y` from -1 to 1, read on the plane the hero rolls on. */
  pick(x: number, y: number): Axial {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const ground = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.hero.position.y), ground);
    return cellAtPoint(ground.x, ground.z);
  }

  private build(cx: number, cy: number): void {
    const counts = Object.fromEntries([...GROUNDS, ...PROP_NAMES].map((k) => [k, 0])) as Record<Ground | Prop, number>;
    const dummy = new THREE.Object3D();
    const put = (mesh: THREE.InstancedMesh, key: Ground | Prop, x: number, y: number, z: number, scaleY: number): void => {
      dummy.position.set(x, y, z);
      dummy.scale.set(1, scaleY, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(counts[key]++, dummy.matrix);
    };
    for (let ky = cy - REACH; ky <= cy + REACH; ky++) {
      for (let kx = cx - REACH; kx <= cx + REACH; kx++) {
        this.world.chunk(kx, ky).forEach((tile, i) => {
          const q = kx * CHUNK + (i % CHUNK);
          const r = ky * CHUNK + Math.floor(i / CHUNK);
          const p = axialTo3D(q, r);
          const ground = GROUND[tile.terrain];
          const top = topOf(ground, tile.height);
          if (ground === 'water') {
            this.grounds.water.setColorAt(counts.water, waterColor(this.world, q, r));
            this.grounds.water.instanceColor!.needsUpdate = true;
          }
          put(this.grounds[ground], ground, p.x, top / 2, p.z, top);
          this.stand(tile, q, r, p, top, put);
        });
      }
    }
    const foes = [];
    for (let ky = cy - REACH; ky <= cy + REACH; ky++) for (let kx = cx - REACH; kx <= cx + REACH; kx++) foes.push(...this.world.enemies(kx, ky));
    this.place(this.foes, foes);
    this.enemyCount = foes.length;
    for (const key of [...GROUNDS, ...PROP_NAMES]) {
      const mesh = key in this.grounds ? this.grounds[key as Ground] : this.props[key as Prop];
      mesh.count = counts[key];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** The prop a tile carries on its ground, `top` high. */
  private stand(
    tile: Tile,
    q: number,
    r: number,
    p: { x: number; z: number },
    top: number,
    put: (mesh: THREE.InstancedMesh, key: Prop, x: number, y: number, z: number, scaleY: number) => void,
  ): void {
    const v = variety(q, r);
    if (tile.terrain === 'peak') put(this.props.mountain, 'mountain', p.x, top + (1.2 + v * 0.8) / 2, p.z, 1.2 + v * 0.8);
    else if (tile.terrain === 'tree') put(this.props.tree, 'tree', p.x, top + (0.8 + v * 0.4) / 2, p.z, 0.8 + v * 0.4);
    else if (tile.terrain === 'boulder') put(this.props.boulder, 'boulder', p.x, top + 0.2, p.z, 0.8);
    else if (tile.terrain === 'wall') {
      put(this.props.wall, 'wall', p.x, top + WALL / 2, p.z, WALL);
      put(this.props.cap, 'cap', p.x, top + WALL + CAP / 2, p.z, CAP);
    }
  }
}
