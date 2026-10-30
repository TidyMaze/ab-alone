// The Open world on screen (docs/specs/openworld.md section 2): the chunks around the hero drawn as columns of hex
// prisms, lifted by their height and coloured by their terrain, with low-poly props on top (faceted mountains, wire
// pines, boulders, gantry walls with a gold edge), the hero marble, and the camera that follows it. It has its own
// scene, drawn by the page's renderer while the mode is on. Relief and terrain are looks only.
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, cellAtPoint, chunkOf, type Terrain, type Tile, type World } from './openworld';

/** Chunks loaded on each side of the hero's chunk. */
const REACH = 2;
const CAPACITY = (2 * REACH + 1) ** 2 * CHUNK * CHUNK;

/** The ground columns: one instanced mesh each. A blocked terrain stands on the ground of its `GROUND` entry. */
export const GROUNDS = ['water', 'sand', 'grass', 'rock', 'peak'] as const;
type Ground = (typeof GROUNDS)[number];
const GROUND: Record<Terrain, Ground> = {
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
  water: { color: 0x1aa6c4, emissive: 0x0a5568 }, // coolant lakes glow a little
  sand: { color: 0x9a8a62, emissive: 0x000000 },
  grass: { color: 0x3f7d5f, emissive: 0x000000 },
  rock: { color: 0x4b525c, emissive: 0x000000 },
  peak: { color: 0x4a525c, emissive: 0x000000 },
};

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

export class OpenWorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  private readonly grounds = {} as Record<Ground, THREE.InstancedMesh>;
  private readonly props = {} as Record<Prop, THREE.InstancedMesh>;
  private readonly hero: THREE.Mesh;
  private readonly troop: THREE.InstancedMesh;
  private readonly foes: THREE.InstancedMesh;
  /** Reused by every placement, so a draw allocates no matrix holder (#981). */
  private readonly dummy = new THREE.Object3D();
  private readonly enemyCells: Axial[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly ground = new THREE.Vector3();
  private region = '';
  /** The enemy marbles drawn around the hero. */
  enemyCount = 0;

  constructor(private readonly world: World) {
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 18, 34);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2418, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-6, 12, 4);
    this.scene.add(sun);
    const prism = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6);
    for (const ground of GROUNDS) {
      const { color, emissive } = LOOK[ground];
      this.grounds[ground] = this.instances(`terrain-${ground}`, prism, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.9 }));
    }
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
      if (geometry) this.props[prop].geometry = geometry;
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    this.camera.position.set(p.x, 14, p.z + 11);
    this.camera.lookAt(this.hero.position);
    this.camera.updateMatrixWorld();
  }

  /** Lays marbles on the cells, each on its ground, in an instanced mesh. */
  private place(mesh: THREE.InstancedMesh, cells: readonly Axial[]): void {
    const { dummy } = this;
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
    this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
    this.plane.set(this.up, -this.hero.position.y);
    this.ground.set(0, 0, 0);
    this.raycaster.ray.intersectPlane(this.plane, this.ground);
    return cellAtPoint(this.ground.x, this.ground.z);
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

  private build(cx: number, cy: number): void {
    const counts = Object.fromEntries([...GROUNDS, ...PROP_NAMES].map((k) => [k, 0])) as Record<Ground | Prop, number>;
    const { dummy } = this;
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
          put(this.grounds[ground], ground, p.x, top / 2, p.z, top);
          this.stand(tile, q, r, p, top, put);
        });
      }
    }
    const { enemyCells } = this;
    enemyCells.length = 0;
    for (let ky = cy - REACH; ky <= cy + REACH; ky++) for (let kx = cx - REACH; kx <= cx + REACH; kx++) enemyCells.push(...this.world.enemies(kx, ky));
    this.place(this.foes, enemyCells);
    this.enemyCount = enemyCells.length;
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
