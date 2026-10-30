import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { CHUNK, World } from './openworld';
import { GROUNDS, loadModels, LOOK, OpenWorldView, topOf, variety } from './openworldview';

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
