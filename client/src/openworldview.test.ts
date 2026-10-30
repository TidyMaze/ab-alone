import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { cellAtPoint, CHUNK, chunkOf, neighbours, World } from './openworld';
import {
  footprint,
  GROUNDS,
  groundRadius,
  loadModels,
  LOOK,
  MAX_REACH,
  MAX_ZOOM,
  OpenWorldView,
  reachAt,
  reachFor,
  topOf,
  variety,
  WATER,
  maxZoomFor,
  waterColor,
} from './openworldview';

// Every chunk of the square -3..3 is the same: the terrain code runs 0 to 7 along the cells, the height 0 to 3.
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([i % 4, i % 8], i * 2);
  return out;
}
// Every chunk of the world is grass, flat: the loaded square is as wide as the reach asks for.
function grass(): Uint8Array {
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2], i * 2);
  return out;
}
const ground = (view: OpenWorldView) => GROUNDS.reduce((sum, g) => sum + mesh(view, `terrain-${g}`).count, 0);
const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
const counts = (view: OpenWorldView, prefix: string, names: readonly string[]) =>
  Object.fromEntries(names.map((n) => [n, mesh(view, `${prefix}-${n}`).count]));

describe('the Open world view (docs/specs/openworld.md section 2)', () => {
  it('draws every cell of the chunks around the hero as a ground column and its props on top', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(1600, 900); // a 16:9 screen sees the ground three chunks out at the closest view
    view.show([0, 0]);
    const cells = 49 * CHUNK * CHUNK;
    const ground = counts(view, 'terrain', GROUNDS);
    // Codes 0 to 7 repeat 32 times a chunk: water, sand, grass, rock, peak, boulder, tree and wall.
    expect(ground).toEqual({ water: cells / 8, sand: cells / 8, grass: (cells / 8) * 2, rock: (cells / 8) * 3, peak: cells / 8 });
    expect(counts(view, 'prop', ['mountain', 'tree', 'boulder', 'wall', 'cap'])).toEqual({
      mountain: cells / 8,
      tree: cells / 8,
      boulder: cells / 8,
      wall: cells / 8,
      cap: cells / 8,
    });
  });

  it('rebuilds the chunks only when the hero enters another chunk', () => {
    const load = vi.fn(bytes);
    const view = new OpenWorldView(new World(load));
    view.resize(1600, 900); // at 16:9 the reach of the closest view does not move with the hero inside its chunk
    view.show([0, 0]);
    const loaded = load.mock.calls.length;
    view.show([1, 1]);
    expect(load).toHaveBeenCalledTimes(loaded);
    view.show([CHUNK, 0]);
    expect(load.mock.calls.length).toBeGreaterThan(loaded);
  });

  it('puts the hero on its cell and the camera above and behind it, looking at it', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([2, 1]); // code 18 % 8 = 2: grass, height 2
    const hero = view.scene.getObjectByName('hero')!;
    const p = axialTo3D(2, 1);
    expect(hero.position.x).toBeCloseTo(p.x);
    expect(hero.position.z).toBeCloseTo(p.z);
    expect(hero.position.y).toBeCloseTo(topOf('grass', 2) + 0.3);
    expect(view.camera.position.x).toBeCloseTo(p.x);
    expect(view.camera.position.y).toBeGreaterThan(hero.position.y);
    expect(view.camera.position.z).toBeGreaterThan(p.z);
  });

  it('finds the cell under the centre of the screen: the one the hero is on', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(800, 600);
    view.show([2, 1]);
    expect(view.camera.aspect).toBeCloseTo(800 / 600);
    expect(view.pick(0, 0)).toEqual([2, 1]);
    expect(view.pick(0.5, 0)[0]).toBeGreaterThan(2);
  });

  it('lifts a cell by its height, water lies low, and varies props by cell without chance', () => {
    expect(topOf('water', 0)).toBeLessThan(topOf('grass', 0));
    expect(topOf('grass', 3)).toBeGreaterThan(topOf('grass', 1));
    expect(variety(3, 4)).toBe(variety(3, 4));
    const draws = new Set([0, 1, 2, 3, 4, 5].map((q) => variety(q, -q)));
    expect(draws.size).toBeGreaterThan(2);
    for (const d of draws) expect(d).toBeGreaterThanOrEqual(0), expect(d).toBeLessThan(1);
    expect(Object.keys(LOOK)).toEqual([...GROUNDS]);
  });

  it('swaps the procedural shapes for the models it is given, and keeps the others', () => {
    const view = new OpenWorldView(new World(bytes));
    const tree = mesh(view, 'prop-tree').geometry;
    const mountain = new THREE.BoxGeometry();
    view.useModels({ mountain });
    expect(mesh(view, 'prop-mountain').geometry).toBe(mountain);
    expect(mesh(view, 'prop-tree').geometry).toBe(tree);
  });

  it('draws a model that paints its own colours with them, untinted, and keeps the tint of the others', () => {
    const view = new OpenWorldView(new World(bytes));
    const painted = new THREE.BoxGeometry();
    painted.setAttribute('color', new THREE.BufferAttribute(new Float32Array(painted.getAttribute('position').count * 3), 3));
    view.useModels({ mountain: painted, tree: new THREE.BoxGeometry() });
    const paintedMaterial = mesh(view, 'prop-mountain').material as THREE.MeshStandardMaterial;
    expect(paintedMaterial.vertexColors).toBe(true);
    expect(paintedMaterial.color.getHex()).toBe(0xffffff);
    expect(paintedMaterial.emissive.getHex()).toBe(0x000000);
    const plainMaterial = mesh(view, 'prop-tree').material as THREE.MeshStandardMaterial;
    expect(plainMaterial.vertexColors).toBe(false);
    expect(plainMaterial.color.getHex()).toBe(0x2fb5a0);
  });
});

describe('loading the Blender models (client/models/openworld.glb)', () => {
  const scene = new THREE.Group();
  for (const name of ['ow_mountain', 'ow_tree', 'ow_wall']) {
    const m = new THREE.Mesh(new THREE.BoxGeometry());
    m.name = name;
    scene.add(m);
  }

  it('takes the geometry of each model by its name and skips the missing ones', async () => {
    const loader = { loadAsync: vi.fn(async () => ({ scene })) };
    const geometries = await loadModels('/assets/pbr/openworld.glb', loader);
    expect(loader.loadAsync).toHaveBeenCalledWith('/assets/pbr/openworld.glb');
    expect(Object.keys(geometries).sort()).toEqual(['mountain', 'tree', 'wall']);
  });

  it('gives none when the load fails, so the procedural shapes stay', async () => {
    const loader = { loadAsync: async () => Promise.reject(new Error('404')) };
    expect(await loadModels('/x.glb', loader)).toEqual({});
  });
});

describe('the troop and the enemies on screen', () => {
  it('draws the troop where it stands and the enemy marbles around the hero', () => {
    const foes = (cx: number, cy: number): Int32Array => (cx === 0 && cy === 0 ? Int32Array.of(5, 5, 6, 5) : new Int32Array());
    const view = new OpenWorldView(new World(bytes, foes));
    view.show([0, 0], [[1, 0], [0, 1], [-1, 1]]);
    expect(mesh(view, 'troop').count).toBe(3);
    expect(mesh(view, 'enemies').count).toBe(2);
    expect(view.enemyCount).toBe(2);
    const m = new THREE.Matrix4();
    mesh(view, 'enemies').getMatrixAt(1, m);
    const at = new THREE.Vector3().setFromMatrixPosition(m);
    expect(at.x).toBeCloseTo(axialTo3D(6, 5).x);
    expect(at.z).toBeCloseTo(axialTo3D(6, 5).z);
  });
});

describe('the zoom of the Open world camera (#976)', () => {
  const hero = (view: OpenWorldView) => view.scene.getObjectByName('hero')!;
  const back = (view: OpenWorldView) => view.camera.position.z - hero(view).position.z;

  it('starts at the closest view and zooms out to twice the distance, no further nor closer', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([2, 1]);
    expect(view.zoom).toBe(1);
    expect(view.camera.position.y).toBeCloseTo(14);
    expect(back(view)).toBeCloseTo(11);
    view.zoomBy(0.5); // closer than the default: no
    expect(view.zoom).toBe(1);
    view.zoomBy(1.5);
    expect(view.zoom).toBeCloseTo(1.5);
    expect(view.camera.position.y).toBeCloseTo(21);
    view.zoomBy(2 / 1.5);
    expect(view.camera.position.y).toBeCloseTo(28);
    expect(back(view)).toBeCloseTo(22);
    view.zoomBy(1e9);
    expect(view.zoom).toBe(MAX_ZOOM);
  });

  it('moves the fog and the far plane with the zoom, so the edge of the loaded chunks stays hidden', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([2, 1]);
    const fog = view.scene.fog as THREE.Fog;
    // the fog starts at the hero's depth, the middle of the ground in view, and ends past the farthest corner of the footprint
    expect(fog.near).toBeCloseTo(Math.hypot(14, 11));
    expect(fog.far).toBeGreaterThan(fog.near);
    expect(view.camera.far).toBeGreaterThan(fog.far);
    expect(view.camera.near).toBeCloseTo(0.1);
    view.zoomBy(2);
    expect(fog.near).toBeCloseTo(2 * Math.hypot(14, 11));
    expect(view.camera.far).toBeGreaterThan(fog.far);
    expect(view.camera.near).toBeCloseTo(0.2); // the near plane too: the depth precision stays
  });

  it('keeps the camera behind the hero as it walks, at the zoom it has', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([2, 1]);
    view.zoomBy(2);
    view.show([3, 1]);
    expect(view.camera.position.y).toBeCloseTo(28);
    expect(back(view)).toBeCloseTo(22);
  });

  it('picks the cell under the pointer at every zoom', () => {
    for (const level of [1, 1.5, 2]) {
      const view = new OpenWorldView(new World(bytes));
      view.resize(800, 600);
      view.show([2, 1]);
      view.zoomBy(level);
      for (const cell of [[2, 1], ...neighbours([2, 1])] as Axial[]) {
        const p = axialTo3D(cell[0], cell[1]);
        const ndc = new THREE.Vector3(p.x, hero(view).position.y, p.z).project(view.camera);
        expect(view.pick(ndc.x, ndc.y)).toEqual(cell);
      }
    }
  });
});

describe('the loaded chunks cover the ground in view, at every aspect and zoom (#976)', () => {
  const screens: Record<string, [number, number]> = {
    '9/16': [900, 1600],
    '4/3': [800, 600],
    '16/9': [1600, 900],
    '21/9': [2100, 900],
    '32/9': [3840, 1080],
  };
  for (const [name, [width, height]] of Object.entries(screens)) {
    for (const zoom of [1, 2, 4, maxZoomFor(width / height)]) {
      for (const hero of [[0, 0], [CHUNK - 1, -CHUNK]] as Axial[]) {
        it(`keeps the four corners of the footprint inside the loaded square: ${name}, zoom ${zoom}, hero ${hero}`, () => {
          const view = new OpenWorldView(new World(grass));
          view.resize(width, height);
          view.show(hero);
          view.zoomBy(zoom); // a wide screen stops sooner: the zoom is the widest it allows
          const [hq, hr] = chunkOf(hero);
          for (const p of footprint(view.camera)) {
            const [cq, cr] = chunkOf(cellAtPoint(p.x, p.z));
            expect(Math.abs(cq - hq)).toBeLessThanOrEqual(view.reach);
            expect(Math.abs(cr - hr)).toBeLessThanOrEqual(view.reach);
          }
        });
      }
    }
  }

  it('gives the reach in whole chunks: the radius in cells, rounded up to chunks, one chunk of margin', () => {
    expect(reachFor(0)).toBe(1);
    expect(reachFor(CHUNK)).toBe(2);
    expect(reachFor(CHUNK + 0.5)).toBe(3);
  });

  it('stops the zoom where the reach reaches MAX_REACH on a 16:9 screen, and no further', () => {
    expect(maxZoomFor(16 / 9)).toBe(MAX_ZOOM);
    expect(reachAt(16 / 9, MAX_ZOOM)).toBe(MAX_REACH);
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(1e9);
    expect(view.zoom).toBe(MAX_ZOOM);
    expect(view.maxZoom).toBe(MAX_ZOOM);
  });

  it('stops a wide screen sooner, where its reach reaches MAX_REACH: the largest zoom whose reach fits', () => {
    const limit = maxZoomFor(32 / 9);
    expect(limit).toBeLessThan(MAX_ZOOM);
    expect(reachAt(32 / 9, limit)).toBeLessThanOrEqual(MAX_REACH);
    expect(reachAt(32 / 9, limit + 0.05)).toBeGreaterThan(MAX_REACH);
  });

  it('follows the aspect on a resize: a narrower screen lets the zoom go further, a wider one brings it back', () => {
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(1e9);
    const wide = view.zoom;
    view.resize(3840, 1080);
    expect(view.zoom).toBeLessThan(wide);
    expect(view.zoom).toBe(maxZoomFor(32 / 9));
    expect(view.reach).toBeLessThanOrEqual(MAX_REACH);
    view.resize(900, 1600);
    expect(view.maxZoom).toBe(MAX_ZOOM);
  });
});

describe('the far zoom is real 3D, with no overview (#976)', () => {
  const hero = (view: OpenWorldView) => view.scene.getObjectByName('hero')!;

  it('keeps the chunks, the props, the fog and the hero drawn at the widest zoom', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([2, 1]);
    view.zoomBy(MAX_ZOOM);
    expect(view.scene.fog).not.toBeNull();
    expect(mesh(view, 'terrain-grass').visible).toBe(true);
    expect(mesh(view, 'prop-tree').visible).toBe(true);
    expect(hero(view).visible).toBe(true);
  });

  it('loads the chunks the camera sees: the reach grows with the zoom, and a small zoom step rebuilds nothing', () => {
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    expect(view.reach).toBe(3);
    expect(ground(view)).toBe((2 * 3 + 1) ** 2 * CHUNK * CHUNK);
    const version = mesh(view, 'terrain-grass').instanceMatrix.version;
    view.zoomBy(1.01); // the reach is still two chunks: the same chunks, not rebuilt
    expect(mesh(view, 'terrain-grass').instanceMatrix.version).toBe(version);
    view.zoomBy(4);
    expect(view.reach).toBeGreaterThan(2);
    expect(ground(view)).toBe((2 * view.reach + 1) ** 2 * CHUNK * CHUNK);
  });

  it('keeps every chunk of the widest zoom within the capacity of the instanced meshes', () => {
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(MAX_ZOOM);
    expect(reachFor(groundRadius(view.camera, hero(view).position))).toBeLessThanOrEqual(MAX_REACH);
    expect(view.reach).toBeLessThanOrEqual(MAX_REACH);
    expect(ground(view)).toBe((2 * view.reach + 1) ** 2 * CHUNK * CHUNK);
    expect(mesh(view, 'terrain-grass').instanceMatrix.count).toBe((2 * MAX_REACH + 1) ** 2 * CHUNK * CHUNK);
  });

  it('rebuilds the chunks when the hero enters another chunk at a far zoom, with the reach of the zoom', () => {
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(4);
    const reach = view.reach;
    const version = mesh(view, 'terrain-grass').instanceMatrix.version;
    view.show([1, 1]); // the same chunk: nothing is rebuilt
    expect(mesh(view, 'terrain-grass').instanceMatrix.version).toBe(version);
    view.show([CHUNK, 0]); // the next chunk: rebuilt around it, with the same reach
    expect(mesh(view, 'terrain-grass').instanceMatrix.version).toBeGreaterThan(version);
    expect(view.reach).toBe(reach);
    expect(ground(view)).toBe((2 * reach + 1) ** 2 * CHUNK * CHUNK);
  });

  it('gives the visible ground radius from the camera, the field of view and the aspect', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(1600, 900);
    view.show([0, 0]);
    const radius = groundRadius(view.camera, hero(view).position);
    expect(radius).toBeGreaterThan(CHUNK);
    expect(radius).toBeLessThan(2 * CHUNK);
    view.zoomBy(4);
    expect(groundRadius(view.camera, hero(view).position) / radius).toBeCloseTo(4, 0); // the camera stands at the hero's height, so almost linear
  });

  it('reaches far past the loaded chunks when a corner of the screen looks past the horizon, so the reach is capped', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 10, -1); // up: the sky fills the screen
    camera.updateMatrixWorld();
    expect(groundRadius(camera, new THREE.Vector3())).toBeGreaterThan(1000);
    expect(reachFor(groundRadius(camera, new THREE.Vector3()))).toBeGreaterThan(MAX_REACH);
  });

  it('publishes the instances drawn per mesh, the ground, the props, the troop and the enemies', () => {
    const view = new OpenWorldView(new World(bytes, (cx, cy) => (cx === 0 && cy === 0 ? Int32Array.of(5, 5) : new Int32Array())));
    view.show([0, 0], [[1, 0]]);
    const drawn = view.drawn;
    expect(drawn['terrain-grass']).toBe(mesh(view, 'terrain-grass').count);
    expect(drawn['prop-tree']).toBeGreaterThan(0);
    expect(drawn.troop).toBe(1);
    expect(drawn.enemies).toBe(1);
  });
});

// Every cell of the square -3..3 of chunks is the terrain code `code(q, r)`.
const terrain = (code: (q: number, r: number) => number) => (cx: number, cy: number): Uint8Array => {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, code(cx * CHUNK + (i % CHUNK), cy * CHUNK + Math.floor(i / CHUNK))], i * 2);
  return out;
};
const WATER_CODE = 0;
const GRASS_CODE = 2;
const color = (hex: number) => new THREE.Color(hex);

describe('the water (docs/specs/openworld.md section 2): depth, a glossy surface, a slow glow', () => {
  it('colours a cell by its depth: the middle of a lake is deep, a lone water cell is shore', () => {
    expect(waterColor(new World(terrain(() => WATER_CODE)), 0, 0).getHex()).toBe(color(WATER.deep).getHex());
    const lone = new World(terrain((q, r) => (q === 0 && r === 0 ? WATER_CODE : GRASS_CODE)));
    expect(waterColor(lone, 0, 0).getHex()).toBe(color(WATER.shore).getHex());
  });

  it('gets lighter with each neighbour that is land', () => {
    const wet = new Set(neighbours([0, 0]).slice(0, 3).map(([q, r]) => `${q},${r}`));
    const half = new World(terrain((q, r) => (q === 0 && r === 0) || wet.has(`${q},${r}`) ? WATER_CODE : GRASS_CODE));
    expect(waterColor(half, 0, 0).getHex()).toBe(color(WATER.shore).lerp(color(WATER.deep), 0.5).getHex());
  });

  it('treats a cell off the loaded world as land', () => {
    const none = new World(() => new Uint8Array());
    expect(waterColor(none, 0, 0).getHex()).toBe(color(WATER.shore).getHex());
  });

  it('paints each water cell of the view with its depth', () => {
    const lone = new OpenWorldView(new World(terrain((q, r) => (q === 0 && r === 0 ? WATER_CODE : GRASS_CODE))));
    lone.show([0, 0]);
    const paint = new THREE.Color();
    mesh(lone, 'terrain-water').getColorAt(0, paint);
    expect(paint.getHex()).toBe(color(WATER.shore).getHex());
    const sea = new OpenWorldView(new World(terrain(() => WATER_CODE)));
    sea.show([0, 0]);
    mesh(sea, 'terrain-water').getColorAt(0, paint);
    expect(paint.getHex()).toBe(color(WATER.deep).getHex());
  });

  it('has a glossy water surface: a low roughness, so the sun catches it', () => {
    const view = new OpenWorldView(new World(terrain(() => WATER_CODE)));
    expect((mesh(view, 'terrain-water').material as THREE.MeshStandardMaterial).roughness).toBeLessThan(0.5);
  });

  it('knows whether a lake is in view', () => {
    const dry = new OpenWorldView(new World(terrain(() => GRASS_CODE)));
    dry.show([0, 0]);
    expect(dry.hasWater).toBe(false);
    const wet = new OpenWorldView(new World(terrain(() => WATER_CODE)));
    wet.show([0, 0]);
    expect(wet.hasWater).toBe(true);
  });

  it('breathes the glow of the water slowly with time, and holds it still at 0', () => {
    const view = new OpenWorldView(new World(terrain(() => WATER_CODE)));
    view.show([0, 0]);
    const water = mesh(view, 'terrain-water').material as THREE.MeshStandardMaterial;
    view.glow(0);
    expect(water.emissiveIntensity).toBeCloseTo(1);
    view.glow((1200 * Math.PI) / 2);
    expect(water.emissiveIntensity).toBeCloseTo(1.15);
    view.glow(Math.PI * 1200 * 1.5);
    expect(water.emissiveIntensity).toBeCloseTo(0.85);
  });
});
