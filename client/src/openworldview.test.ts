import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, neighbours, World } from './openworld';
import { GROUNDS, loadModels, LOOK, MAX_ZOOM, OpenWorldView, overviewPalette, topOf, variety } from './openworldview';

// Every chunk of the square -3..3 is the same: the terrain code runs 0 to 7 along the cells, the height 0 to 3.
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 2);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([i % 4, i % 8], i * 2);
  return out;
}
const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
const counts = (view: OpenWorldView, prefix: string, names: readonly string[]) =>
  Object.fromEntries(names.map((n) => [n, mesh(view, `${prefix}-${n}`).count]));

describe('the Open world view (docs/specs/openworld.md section 2)', () => {
  it('draws every cell of the chunks around the hero as a ground column and its props on top', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    const cells = 25 * CHUNK * CHUNK;
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
    painted.setAttribute('color', new THREE.BufferAttribute(new Float32Array(painted.attributes.position.count * 3), 3));
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
    expect([fog.near, fog.far, view.camera.far]).toEqual([18, 34, 80]);
    view.zoomBy(2);
    expect([fog.near, fog.far, view.camera.far]).toEqual([36, 68, 160]);
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

describe('the overview past the close range (#976)', () => {
  const hero = (view: OpenWorldView) => view.scene.getObjectByName('hero')!;
  const back = (view: OpenWorldView) => view.camera.position.z - hero(view).position.z;
  const overlay = (view: OpenWorldView) => view.scene.getObjectByName('overview')!;
  const raw = () => new Uint8Array();

  it('switches to the overview past the close range: no fog, the chunks hidden, the plane and the hero dot shown', () => {
    const view = new OpenWorldView(new World(bytes), raw);
    view.show([2, 1]);
    expect(view.scene.fog).not.toBeNull();
    expect(mesh(view, 'terrain-grass').visible).toBe(true);
    expect(overlay(view).visible).toBe(false);
    view.zoomBy(2.5); // the close range's last view: still the real chunks
    expect(view.scene.fog).not.toBeNull();
    view.zoomBy(1.1);
    expect(view.scene.fog).toBeNull();
    expect(mesh(view, 'terrain-grass').visible).toBe(false);
    expect(hero(view).visible).toBe(false);
    expect(overlay(view).visible).toBe(true);
    expect(view.camera.near).toBeGreaterThan(1);
    view.zoomBy(1 / 1e3); // back below the close range
    expect(view.scene.fog).not.toBeNull();
    expect(mesh(view, 'terrain-grass').visible).toBe(true);
    expect(overlay(view).visible).toBe(false);
  });

  it('looks straight down at the hero from high up, the tilt easing to none at the widest zoom', () => {
    const view = new OpenWorldView(new World(bytes), raw);
    view.show([2, 1]);
    view.zoomBy(3);
    expect(back(view)).toBeGreaterThan(0);
    view.zoomBy(MAX_ZOOM / 3);
    expect(view.zoom).toBe(MAX_ZOOM);
    expect(back(view)).toBeCloseTo(0, 6);
    expect(view.camera.position.y).toBeCloseTo(Math.hypot(14, 11) * MAX_ZOOM, 0);
    expect(view.camera.far).toBeGreaterThan(view.camera.position.y * 2);
    const dot = view.scene.getObjectByName('overview-hero')!;
    expect(dot.position.x).toBeCloseTo(hero(view).position.x);
    expect(dot.position.z).toBeCloseTo(hero(view).position.z);
    expect(dot.scale.x).toBeGreaterThan(1);
  });

  it('paints the overview from the raw loader, not through the world, a few chunks at a time', () => {
    const world = vi.fn(bytes);
    const loader = vi.fn(() => new Uint8Array());
    const view = new OpenWorldView(new World(world), loader);
    view.show([0, 0]);
    expect(view.paintOverview(8)).toBe(false); // not on yet
    view.zoomBy(5);
    const worldCalls = world.mock.calls.length; // the close range's chunks are read through the world, once
    expect(view.paintOverview(8)).toBe(true);
    expect(loader).toHaveBeenCalledTimes(8);
    expect(world.mock.calls.length).toBe(worldCalls);
  });

  it('frees the texture, the plane and the dot when the overview is disposed, and is safe to dispose before it was made', () => {
    const view = new OpenWorldView(new World(bytes), raw);
    view.show([0, 0]);
    view.disposeOverview(); // none made yet
    view.zoomBy(5);
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose');
    const texture = vi.spyOn(THREE.DataTexture.prototype, 'dispose');
    view.disposeOverview();
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(2);
    expect(texture).toHaveBeenCalledTimes(1);
    expect(view.scene.fog).not.toBeNull();
    view.disposeOverview(); // again: nothing left
    expect(texture).toHaveBeenCalledTimes(1);
  });

  it('without a loader the chunks count as painted and the overview keeps the sky colour', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    view.zoomBy(5);
    expect(view.paintOverview(4)).toBe(true);
    view.disposeOverview();
  });

  it('gives the palette of the terrains: one colour each, a boulder, tree and wall in their ground colour', () => {
    const palette = overviewPalette();
    const colour = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255];
    expect(Array.from(palette.subarray(0, 4))).toEqual(colour(LOOK.water.color));
    expect(Array.from(palette.subarray(5 * 4, 5 * 4 + 4))).toEqual(colour(LOOK.rock.color)); // boulder
    expect(Array.from(palette.subarray(6 * 4, 6 * 4 + 4))).toEqual(colour(LOOK.grass.color)); // tree
    expect(Array.from(palette.subarray(7 * 4, 7 * 4 + 4))).toEqual(colour(LOOK.rock.color)); // wall
  });
});
