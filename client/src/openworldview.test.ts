import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { BIOMES, type Biome, cellAtPoint, CHUNK, chunkOf, neighbours, type Terrain, type Tile, TROOP, World } from './openworld';
import {
  BIOME_LOOK,
  CAPACITY,
  groundColour,
  footprint,
  GROUND,
  GROUNDS,
  groundRadius,
  HI_CAPACITY,
  HI_RADIUS,
  loadModels,
  LOOK,
  MAX_REACH,
  MAX_ZOOM,
  MOST,
  OpenWorldView,
  reachAt,
  reachFor,
  STEP,
  topOf,
  variety,
  WATER,
  maxZoomFor,
  waterColor,
} from './openworldview';

// Every chunk of the square -3..3 is the same: the terrain code runs 0 to 7 along the cells, the height 0 to 3.
function bytes(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([i % 4, i % 8, 0], i * 3);
  return out;
}
// Grass everywhere, each cell at its level from `levels` (`base` for the others): a chunk of the square -3..3 (#988).
function stepped(levels: Map<string, number>, base = 3): (cx: number, cy: number) => Uint8Array {
  return (cx, cy) => {
    if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      const q = cx * CHUNK + (i % CHUNK);
      const r = cy * CHUNK + Math.floor(i / CHUNK);
      out.set([levels.get(`${q},${r}`) ?? base, 2, 0], i * 3);
    }
    return out;
  };
}
// Every chunk of the world is grass, flat: the loaded square is as wide as the reach asks for.
function grass(): Uint8Array {
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
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
    // walls and caps are a sparse prop: a real world fills nothing like their capacity, this one (one cell in eight) grows them (#1010)
    expect(counts(view, 'prop', ['mountain', 'tree', 'boulder', 'wall', 'cap'])).toEqual({
      mountain: cells / 8,
      tree: cells / 8,
      boulder: cells / 8,
      wall: cells / 8,
      cap: cells / 8,
    });
  });

  it('loads the chunks only when the hero enters another chunk, the chunks it has are kept', () => {
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
    expect(view.pick(0.5, 0)).toEqual([2, 1]); // a point off the ring of the hero is no move (#988)
  });

  it('lifts a cell by its height, water lies low, and varies props by cell without chance', () => {
    expect(topOf('water', 0)).toBeLessThan(topOf('grass', 0));
    expect(topOf('grass', 3)).toBeGreaterThan(topOf('grass', 1));
    // The eight levels 0 to 7 are one step apart: level 0 is 0.2 (land), a peak (level 7) stands 7 steps up, water lies at 0.08.
    expect(topOf('grass', 0)).toBeCloseTo(0.2);
    expect(topOf('peak', 7)).toBeCloseTo(0.2 + 7 * STEP);
    for (let level = 0; level < 7; level++) expect(topOf('sand', level + 1) - topOf('sand', level)).toBeCloseTo(STEP);
    expect(topOf('water', 7)).toBeCloseTo(0.08);
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
    view.useModels({ low: { mountain }, high: {} });
    // the mesh draws the model's shape, from its own copy of the geometry (#991)
    expect(mesh(view, 'prop-mountain').geometry.getAttribute('position').count).toBe(mountain.getAttribute('position').count);
    expect(mesh(view, 'prop-mountain').geometry).not.toBe(mountain);
    expect(mesh(view, 'prop-tree').geometry).toBe(tree);
  });

  it('draws a model that paints its own colours with them, untinted, and keeps the tint of the others', () => {
    const view = new OpenWorldView(new World(bytes));
    const painted = new THREE.BoxGeometry();
    painted.setAttribute('color', new THREE.BufferAttribute(new Float32Array(painted.getAttribute('position').count * 3), 3));
    view.useModels({ low: { mountain: painted, tree: new THREE.BoxGeometry() }, high: { mountain: painted } });
    const paintedMaterial = mesh(view, 'prop-mountain').material as THREE.MeshStandardMaterial;
    expect(paintedMaterial.vertexColors).toBe(true);
    expect(paintedMaterial.color.getHex()).toBe(0xffffff);
    expect(paintedMaterial.emissive.getHex()).toBe(0x000000);
    const detailedMaterial = mesh(view, 'prop-mountain-hi').material as THREE.MeshStandardMaterial;
    expect(detailedMaterial.vertexColors).toBe(true);
    expect(detailedMaterial.color.getHex()).toBe(0xffffff);
    const plainMaterial = mesh(view, 'prop-tree').material as THREE.MeshStandardMaterial;
    expect(plainMaterial.vertexColors).toBe(false);
    expect(plainMaterial.color.getHex()).toBe(0x2fb5a0);
  });
});

describe('loading the Blender models (client/models/openworld.glb, openworld-hi.glb, #989)', () => {
  const sceneOf = (names: string[]) => {
    const scene = new THREE.Group();
    for (const name of names) {
      const m = new THREE.Mesh(new THREE.BoxGeometry());
      m.name = name;
      scene.add(m);
    }
    return scene;
  };
  const urls = { low: '/assets/pbr/openworld.glb', high: '/assets/pbr/openworld-hi.glb' };
  // each file holds its own names: the low-poly `ow_<prop>`, the detailed `ow_<prop>_hi`
  const files: Record<string, THREE.Group> = {
    [urls.low]: sceneOf(['ow_mountain', 'ow_tree', 'ow_wall']),
    [urls.high]: sceneOf(['ow_mountain_hi', 'ow_tree_hi', 'ow_boulder_hi', 'ow_wall_hi']),
  };

  it('takes the geometry of each model by its name: the low-poly ones from one file, the detailed ones from the other', async () => {
    const loader = { loadAsync: vi.fn(async (url: string) => ({ scene: files[url]! })) };
    const models = await loadModels(urls, loader);
    expect(loader.loadAsync).toHaveBeenCalledWith(urls.low);
    expect(loader.loadAsync).toHaveBeenCalledWith(urls.high);
    expect(Object.keys(models.low).sort()).toEqual(['mountain', 'tree', 'wall']);
    expect(Object.keys(models.high).sort()).toEqual(['boulder', 'mountain', 'tree', 'wall']);
  });

  it('keeps the low-poly models when only the detailed file fails: the low-poly props draw every cell', async () => {
    const loader = { loadAsync: async (url: string) => (url === urls.high ? Promise.reject(new Error('404')) : { scene: files[url]! }) };
    const models = await loadModels(urls, loader);
    expect(Object.keys(models.low).sort()).toEqual(['mountain', 'tree', 'wall']);
    expect(models.high).toEqual({});
  });

  it('gives none when both loads fail, so the procedural shapes stay', async () => {
    const loader = { loadAsync: async () => Promise.reject(new Error('404')) };
    expect(await loadModels(urls, loader)).toEqual({ low: {}, high: {} });
  });
});

// Every chunk of the square -3..3 is one terrain code: 4 a peak, 5 a boulder, 6 a tree, 7 a wall.
function all(terrain: number): (cx: number, cy: number) => Uint8Array {
  return (cx, cy) => {
    if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, terrain, 0], i * 3);
    return out;
  };
}
const hexDistance = ([q1, r1]: Axial, [q2, r2]: Axial): number => {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
};
/** The cell of each instance of a mesh, read back from its matrices. */
const cellsOf = (view: OpenWorldView, name: string): Axial[] => {
  const m = mesh(view, name);
  const matrix = new THREE.Matrix4();
  const out: Axial[] = [];
  for (let i = 0; i < m.count; i++) {
    m.getMatrixAt(i, matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    out.push(cellAtPoint(p.x, p.z));
  }
  return out;
};
const box = () => new THREE.BoxGeometry();

describe('the detailed props near the hero (#989)', () => {
  it('has a detailed mesh per modelled prop, holding the cells within HI_RADIUS of the hero: 3r(r+1)+1', () => {
    expect(HI_RADIUS).toBe(8);
    expect(HI_CAPACITY).toBe(3 * HI_RADIUS * (HI_RADIUS + 1) + 1);
    const view = new OpenWorldView(new World(bytes));
    for (const prop of ['mountain', 'tree', 'boulder', 'wall']) {
      expect(mesh(view, `prop-${prop}-hi`).instanceMatrix.count).toBe(HI_CAPACITY);
    }
  });

  it('draws the cells within HI_RADIUS of the hero with the detailed mesh, the others with the low-poly one, each in exactly one', () => {
    const view = new OpenWorldView(new World(all(4)));
    view.resize(1600, 900);
    view.useModels({ low: { mountain: box() }, high: { mountain: box() } });
    view.show([0, 0]);
    const near = cellsOf(view, 'prop-mountain-hi');
    const far = cellsOf(view, 'prop-mountain');
    const cells = 49 * CHUNK * CHUNK;
    expect(near).toHaveLength(HI_CAPACITY); // every cell of the hex of radius 8 is loaded
    expect(new Set(near.map(String)).size).toBe(HI_CAPACITY);
    expect(near.every((c) => hexDistance(c, [0, 0]) <= HI_RADIUS)).toBe(true);
    expect(far.every((c) => hexDistance(c, [0, 0]) > HI_RADIUS)).toBe(true);
    expect(new Set([...near, ...far].map(String)).size).toBe(cells);
    expect(near.length + far.length).toBe(cells);
  });

  it('moves the split with the hero: a step to a neighbour rebuilds it, so the cells now in reach are detailed', () => {
    const view = new OpenWorldView(new World(all(4)));
    view.resize(1600, 900);
    view.useModels({ low: {}, high: { mountain: box() } });
    view.show([0, 0]);
    expect(cellsOf(view, 'prop-mountain-hi')).not.toContainEqual([9, 0]);
    view.show([1, 0]); // (9, 0) is 8 cells from here, 9 from the first cell
    expect(cellsOf(view, 'prop-mountain-hi')).toContainEqual([9, 0]);
    expect(cellsOf(view, 'prop-mountain-hi')).not.toContainEqual([-8, 0]); // 9 from here, 8 from the first cell
  });

  it('draws only the low-poly props until the detailed models arrive, then rebuilds with them at once', () => {
    const view = new OpenWorldView(new World(all(4)));
    view.resize(1600, 900);
    view.show([0, 0]);
    expect(view.drawn['prop-mountain-hi']).toBe(0);
    expect(view.drawn['prop-mountain']).toBe(49 * CHUNK * CHUNK);
    view.useModels({ low: {}, high: { mountain: box() } }); // no hero step: the view rebuilds the split itself
    expect(view.drawn['prop-mountain-hi']).toBe(HI_CAPACITY);
    expect(view.drawn['prop-mountain']).toBe(49 * CHUNK * CHUNK - HI_CAPACITY);
  });

  it('keeps every cell on the low-poly mesh when the detailed models did not load', () => {
    const view = new OpenWorldView(new World(all(4)));
    view.resize(1600, 900);
    view.useModels({ low: { mountain: box() }, high: {} });
    view.show([0, 0]);
    expect(view.drawn['prop-mountain-hi']).toBe(0);
    expect(view.drawn['prop-mountain']).toBe(49 * CHUNK * CHUNK);
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
    expect(view.camera.position.y).toBeCloseTo(14 + view.focusHeight); // the camera rides the height it looks at (#988)
    expect(back(view)).toBeCloseTo(11);
    view.zoomBy(0.5); // closer than the default: no
    expect(view.zoom).toBe(1);
    view.zoomBy(1.5);
    expect(view.zoom).toBeCloseTo(1.5);
    expect(view.camera.position.y).toBeCloseTo(21 + view.focusHeight);
    view.zoomBy(2 / 1.5);
    expect(view.camera.position.y).toBeCloseTo(28 + view.focusHeight); // the camera rides the height it looks at (#988)
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
    expect(view.camera.position.y).toBeCloseTo(28 + view.focusHeight); // the camera rides the height it looks at (#988)
    expect(back(view)).toBeCloseTo(22);
  });

  it('picks the cell under the pointer at every zoom', () => {
    for (const level of [1, 1.5, 2]) {
      const world = new World(bytes);
      const view = new OpenWorldView(world);
      view.resize(800, 600);
      view.show([2, 1]);
      view.zoomBy(level);
      for (const cell of [[2, 1], ...neighbours([2, 1])] as Axial[]) {
        const p = axialTo3D(cell[0], cell[1]);
        const tile = world.tile(cell[0], cell[1])!;
        const ndc = new THREE.Vector3(p.x, topOf(GROUND[tile.terrain], tile.height), p.z).project(view.camera);
        expect(view.pick(ndc.x, ndc.y)).toEqual(cell);
      }
    }
  });

  it('picks the neighbour under the pointer on its own column top, 0 to 3 levels above and below the hero, close and far (#988)', () => {
    for (const zoom of [1, MAX_ZOOM]) {
      for (const d of neighbours([0, 0]) as Axial[]) {
        for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
          // A cell lower than the ring hides behind it when it lies behind the hero: the ray to its top runs into the ring's
          // columns, so only the two cells in front (`d[1] === 1`, nearest the camera) are clicked below the ring's level.
          if (k < 0 && d[1] !== 1) continue;
          // The hero stands on level 3 and one neighbour on 3 + k: every other cell of the ring is level 3.
          const view = new OpenWorldView(new World(stepped(new Map([[`${d[0]},${d[1]}`, 3 + k]]))));
          view.resize(800, 600);
          view.show([0, 0]);
          view.zoomBy(zoom);
          const p = axialTo3D(d[0], d[1]);
          const ndc = new THREE.Vector3(p.x, topOf('grass', 3 + k), p.z).project(view.camera);
          expect(view.pick(ndc.x, ndc.y), `${d} at level ${3 + k}, zoom ${zoom}`).toEqual(d);
        }
      }
    }
  });

  it('gives the hero its own cell, no move, when the pointer is on no cell of the hero ring', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(800, 600);
    view.show([0, 0]);
    expect(view.pick(1, 1)).toEqual([0, 0]);
  });

  it('skips a neighbour off the loaded world: the pick at the centre is the hero on the edge of the world', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(800, 600);
    view.show([CHUNK * 4 - 1, 0]); // the last cell of chunk 3: the cells to its right are in chunk 4, not loaded
    expect(view.pick(0, 0)).toEqual([CHUNK * 4 - 1, 0]);
  });

  it('gives the hero its own cell when the ray misses every top, a camera looking up away from the ground (#988)', () => {
    const view = new OpenWorldView(new World(bytes));
    view.resize(800, 600);
    view.show([2, 1]);
    view.camera.position.set(0, 10, 0);
    view.camera.lookAt(0, 20, 0); // every ray climbs: no top plane below it is ever reached
    view.camera.updateMatrixWorld();
    expect(view.pick(0, 0)).toEqual([2, 1]);
  });

  it('eases the camera height to a step up a cliff: not at once, on the top within 0.6 s, never past it (#988)', () => {
    const view = new OpenWorldView(new World(stepped(new Map([['1,0', 3]]), 0)));
    view.resize(800, 600);
    view.show([0, 0]);
    expect(view.focusHeight).toBeCloseTo(view.scene.getObjectByName('hero')!.position.y);
    view.show([1, 0]); // a step onto a cell 3 levels up: the top is 3 * STEP higher
    const top = view.scene.getObjectByName('hero')!.position.y;
    expect(top - view.focusHeight).toBeCloseTo(3 * STEP);
    const start = view.focusHeight;
    expect(view.ease(1 / 60, false)).toBe(true);
    expect(view.focusHeight).toBeGreaterThan(start);
    expect(view.focusHeight).toBeLessThan(top - 0.1); // not at its target at once
    let highest = view.focusHeight;
    // At 0.6 s the gap is 3 * STEP * exp(-5), 0.01 for STEP 0.5: it is on the top within 40 frames (0.67 s).
    for (let frame = 1; frame < 40; frame++) {
      view.ease(1 / 60, false);
      highest = Math.max(highest, view.focusHeight);
    }
    expect(Math.abs(view.focusHeight - top)).toBeLessThanOrEqual(0.01); // on the top after 0.67 s
    expect(highest).toBeLessThanOrEqual(top); // the ease never overshoots
    expect(view.ease(1 / 60, false)).toBe(false); // settled: nothing to draw
    expect(view.focusHeight).toBe(top);
  });

  it('jumps to the top at once when the ease is instant (reduced motion, #988)', () => {
    const view = new OpenWorldView(new World(stepped(new Map([['1,0', 3]]), 0)));
    view.show([0, 0]);
    view.show([1, 0]);
    expect(view.ease(1 / 60, true)).toBe(true);
    expect(view.focusHeight).toBe(view.scene.getObjectByName('hero')!.position.y);
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

describe('the instance capacity of each mesh (#976): no waste, and no write past the end', () => {
  it('sizes the troop at the troop, and each other mesh at its measured maximum, not the widest view', () => {
    const view = new OpenWorldView(new World(grass));
    expect(mesh(view, 'troop').instanceMatrix.count).toBe(TROOP);
    expect(mesh(view, 'enemies').instanceMatrix.count).toBe(CAPACITY.enemies);
    expect(mesh(view, 'prop-mountain').instanceMatrix.count).toBe(CAPACITY.mountain);
    expect(mesh(view, 'terrain-grass').instanceMatrix.count).toBe(CAPACITY.grass);
  });

  it('grows a mesh to draw every peak of the widest view, past its capacity, up to the most cells', () => {
    const peaks = (cx: number, cy: number): Uint8Array => {
      if (Math.abs(cx) > 40 || Math.abs(cy) > 40) return new Uint8Array();
      const out = new Uint8Array(CHUNK * CHUNK * 3);
      for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 4, 0], i * 3); // every cell a peak
      return out;
    };
    const view = new OpenWorldView(new World(peaks));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(MAX_ZOOM); // the widest view holds more peaks than the mountains' capacity: the mesh grows
    expect(mesh(view, 'prop-mountain').count).toBe(MOST);
    expect(view.drawn['prop-mountain']).toBe(MOST);
  });

  it('grows the enemies to draw every one of them, and counts the ones drawn', () => {
    const crowd = Int32Array.from({ length: 2 * (CAPACITY.enemies + 10) }, () => 5); // every enemy on the cell (5, 5)
    const view = new OpenWorldView(new World(grass, (cx, cy) => (cx === 0 && cy === 0 ? crowd : new Int32Array())));
    view.show([0, 0]);
    expect(mesh(view, 'enemies').count).toBe(CAPACITY.enemies + 10);
    expect(view.enemyCount).toBe(CAPACITY.enemies + 10);
  });

  // #1010: a mesh past its initial capacity grows; only the theoretical most cells of the widest view are dropped.
  const filled = (code: number) => (cx: number, cy: number): Uint8Array => {
    if (Math.abs(cx) > 40 || Math.abs(cy) > 40) return new Uint8Array();
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) out.set([0, code, 0], i * 3); // every cell of one terrain, flat
    return out;
  };

  it('draws every water cell of the widest view, past the capacity of the water mesh (#1010)', () => {
    const view = new OpenWorldView(new World(filled(0))); // code 0: water
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(MAX_ZOOM);
    const side = 2 * view.reach + 1;
    expect(view.drawn['terrain-water']).toBe(side * side * CHUNK * CHUNK);
    expect(view.drawn['terrain-water']).toBeGreaterThan(CAPACITY.water);
    expect(mesh(view, 'terrain-water').instanceColor).not.toBeNull(); // the colour of each lake, kept through the growth
  });

  it('draws every tree of the widest view, past the capacity of the tree mesh (#1010)', () => {
    const view = new OpenWorldView(new World(filled(6))); // code 6: tree
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(MAX_ZOOM);
    const side = 2 * view.reach + 1;
    expect(view.drawn['prop-tree']).toBe(side * side * CHUNK * CHUNK);
    expect(view.drawn['prop-tree']).toBeGreaterThan(CAPACITY.tree);
  });

  it('grows the troop past its capacity too, so no marble of the troop is dropped (#1010)', () => {
    const view = new OpenWorldView(new World(grass));
    const troop = Array.from({ length: TROOP + 5 }, (_, i): Axial => [i % 5, 0]);
    view.show([0, 0], troop);
    expect(view.drawn.troop).toBe(TROOP + 5);
  });

  it('clamps the enemies at the most cells of the widest view, past the capacity they grow to (#1010)', () => {
    const crowd = Int32Array.from({ length: 2 * (MOST + 5) }, () => 5);
    const view = new OpenWorldView(new World(grass, (cx, cy) => (cx === 0 && cy === 0 ? crowd : new Int32Array())));
    view.show([0, 0]);
    expect(view.enemyCount).toBe(MOST);
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
    // every cell of the square is grass here: the grass mesh grows to hold all of them, and no more than the most
    const square = (2 * view.reach + 1) ** 2 * CHUNK * CHUNK;
    expect(mesh(view, 'terrain-grass').count).toBe(square);
    expect(mesh(view, 'terrain-grass').instanceMatrix.count).toBe(square);
    expect(square).toBeLessThanOrEqual(MOST);
  });

  it('rebuilds the chunks when the hero enters another chunk at a far zoom, with the reach of the zoom', () => {
    const view = new OpenWorldView(new World(grass));
    view.resize(1600, 900);
    view.show([0, 0]);
    view.zoomBy(4);
    const reach = view.reach;
    const version = mesh(view, 'terrain-grass').instanceMatrix.version;
    view.show([1, 1]); // the same chunk: the split of the detailed props is redrawn with the hero's cell, the reach kept (#989)
    expect(view.reach).toBe(reach);
    expect(mesh(view, 'terrain-grass').instanceMatrix.version).toBeGreaterThan(version);
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
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, code(cx * CHUNK + (i % CHUNK), cy * CHUNK + Math.floor(i / CHUNK)), 0], i * 3);
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

/** The geometries and the materials of the meshes of a view's scene, each once. */
const objectsOf = (view: OpenWorldView) => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  view.scene.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    geometries.add((object as THREE.Mesh).geometry);
    materials.add((object as THREE.Mesh).material as THREE.Material);
  });
  return { geometries, materials };
};

describe('the Open world view frees its GPU objects (#981)', () => {
  it('disposes every geometry and material of its scene once, the models it was given included', () => {
    const view = new OpenWorldView(new World(bytes));
    view.useModels({ low: { tree: new THREE.BoxGeometry() }, high: { tree: new THREE.BoxGeometry() } });
    view.show([0, 0]);
    const { geometries, materials } = objectsOf(view);
    expect(geometries.size).toBeGreaterThan(5);
    view.drain(); // a frame has drawn since the models came: what they replaced is freed (#1017)
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, 'dispose');
    view.dispose();
    expect(disposeGeometry.mock.calls.length).toBe(geometries.size);
    expect(new Set(disposeGeometry.mock.contexts)).toEqual(geometries);
    expect(disposeMaterial.mock.calls.length).toBe(materials.size);
    expect(new Set(disposeMaterial.mock.contexts)).toEqual(materials);
    const detailed = mesh(view, 'prop-tree-hi'); // the detailed meshes are freed with the rest (#989)
    expect(disposeGeometry.mock.contexts).toContain(detailed.geometry);
    expect(disposeMaterial.mock.contexts).toContain(detailed.material);
    vi.restoreAllMocks();
  });
});

describe('the Open world view frees the instance buffers of each mesh (#991)', () => {
  const instanced = (view: OpenWorldView): THREE.InstancedMesh[] => {
    const out: THREE.InstancedMesh[] = [];
    view.scene.traverse((object) => {
      if ((object as THREE.InstancedMesh).isInstancedMesh) out.push(object as THREE.InstancedMesh);
    });
    return out;
  };

  it('gives each instanced mesh its own geometry: a shared one frees the instance buffers of only one of its meshes', () => {
    const view = new OpenWorldView(new World(grass));
    view.useModels({ low: { tree: box() }, high: { tree: box() } });
    view.show([0, 0]);
    const meshes = instanced(view);
    expect(meshes.length).toBeGreaterThan(5);
    expect(new Set(meshes.map((m) => m.geometry)).size).toBe(meshes.length);
  });

  it('a grown mesh takes a geometry of its own, and the geometry it replaces is disposed with it', () => {
    const peaks = (cx: number, cy: number): Uint8Array => {
      if (Math.abs(cx) > 40 || Math.abs(cy) > 40) return new Uint8Array();
      const out = new Uint8Array(CHUNK * CHUNK * 3);
      for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 4, 0], i * 3);
      return out;
    };
    const view = new OpenWorldView(new World(peaks));
    view.resize(1600, 900);
    view.show([0, 0]);
    const before = mesh(view, 'prop-mountain').geometry;
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    view.zoomBy(MAX_ZOOM);
    expect(mesh(view, 'prop-mountain').count).toBe(MOST);
    expect(mesh(view, 'prop-mountain').geometry).not.toBe(before);
    view.drain();
    expect(disposeGeometry.mock.contexts).toContain(before);
    expect(new Set(instanced(view).map((m) => m.geometry)).size).toBe(instanced(view).length);
    vi.restoreAllMocks();
  });
});

describe('a replaced geometry is freed after the frame that may use it, not at once (#1017)', () => {
  it('keeps a model geometry that replaces a procedural one until the next draw, then frees it', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    const procedural = mesh(view, 'prop-mountain').geometry;
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    view.useModels({ low: { mountain: new THREE.BoxGeometry() }, high: {} });
    expect(disposeGeometry.mock.contexts).not.toContain(procedural);
    view.drain();
    expect(disposeGeometry.mock.contexts).toContain(procedural);
    vi.restoreAllMocks();
  });

  it('keeps the geometry and the mesh that a growth replaces until the next draw, then frees them', () => {
    const peaks = (cx: number, cy: number): Uint8Array => {
      if (Math.abs(cx) > 40 || Math.abs(cy) > 40) return new Uint8Array();
      const out = new Uint8Array(CHUNK * CHUNK * 3);
      for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 4, 0], i * 3);
      return out;
    };
    const view = new OpenWorldView(new World(peaks));
    view.resize(1600, 900);
    view.show([0, 0]);
    const old = mesh(view, 'prop-mountain');
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeMesh = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    view.zoomBy(MAX_ZOOM);
    expect(mesh(view, 'prop-mountain')).not.toBe(old);
    expect(disposeGeometry.mock.contexts).not.toContain(old.geometry);
    expect(disposeMesh.mock.contexts).not.toContain(old);
    view.drain();
    expect(disposeGeometry.mock.contexts).toContain(old.geometry);
    expect(disposeMesh.mock.contexts).toContain(old);
    vi.restoreAllMocks();
  });

  it('frees what it still holds when it is disposed before any draw', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    const procedural = mesh(view, 'prop-mountain').geometry;
    view.useModels({ low: { mountain: new THREE.BoxGeometry() }, high: {} });
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    view.dispose();
    expect(disposeGeometry.mock.contexts).toContain(procedural);
    vi.restoreAllMocks();
  });

  it('frees a replaced geometry once, however often it is drained', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    const procedural = mesh(view, 'prop-mountain').geometry;
    view.useModels({ low: { mountain: new THREE.BoxGeometry() }, high: {} });
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    view.drain();
    view.drain();
    expect(disposeGeometry.mock.contexts.filter((g) => g === procedural)).toHaveLength(1);
    vi.restoreAllMocks();
  });
});

describe('the biomes look (openworld-terrain.md section 4, #984)', () => {
  const at = (height: number, terrain: Terrain, biome: Biome): Tile => ({ height, terrain, biome });
  // The chunks of the square -2..2, each one biome by its column (`cx` mod 5 is the biome code), with a tree or a boulder
  // every other cell on the low ground (heights 3 and 4): five biomes, each with its props.
  const biomeOf = (cx: number) => BIOMES[((cx % 5) + 5) % 5]!;
  const byBiome = (cx: number, cy: number): Uint8Array => {
    if (Math.abs(cx) > 2 || Math.abs(cy) > 2) return new Uint8Array();
    const out = new Uint8Array(CHUNK * CHUNK * 3);
    for (let i = 0; i < CHUNK * CHUNK; i++) out.set([3 + (i % 2), i % 2 ? 5 : 6, BIOMES.indexOf(biomeOf(cx))], i * 3);
    return out;
  };
  const colourOf = (view: OpenWorldView, name: string): number[] => {
    const m = mesh(view, name);
    return Array.from({ length: m.count }, (_, i) => new THREE.Color().fromArray(m.instanceColor!.array, i * 3).getHex());
  };

  it('colours the low grass by its biome, and every other ground by LOOK', () => {
    expect(groundColour(at(3, 'grass', 'meadow'), 'grass')).toBe(LOOK.grass.color);
    expect(groundColour(at(4, 'grass', 'tundra'), 'grass')).toBe(BIOME_LOOK.tundra.ground);
    expect(groundColour(at(3, 'tree', 'desert'), 'grass')).toBe(BIOME_LOOK.desert.ground); // a tree stands on the grass of its biome
    expect(groundColour(at(5, 'grass', 'desert'), 'grass')).toBe(LOOK.grass.color); // uplands keep their green
    expect(groundColour(at(2, 'sand', 'tundra'), 'sand')).toBe(LOOK.sand.color); // the shore keeps its sand
    expect(groundColour(at(0, 'water', 'tundra'), 'water')).toBe(LOOK.water.color); // water keeps its colour (waterColor)
  });

  it('gives each biome its own low ground, the meadow the grass of before', () => {
    expect(BIOME_LOOK.meadow.ground).toBe(0x3f7d5f);
    expect(new Set(BIOMES.map((biome) => BIOME_LOOK[biome].ground)).size).toBe(BIOMES.length);
  });

  it('tints the trees and the boulders: whitish in tundra, warm in desert and badlands, neutral elsewhere', () => {
    expect(BIOME_LOOK.meadow.prop).toBe(0xffffff);
    expect(BIOME_LOOK.forest.prop).toBe(0xffffff);
    expect(BIOME_LOOK.tundra.prop).toBe(0xe4f0f8);
    expect(BIOME_LOOK.desert.prop).toBe(0xffd39a);
    expect(BIOME_LOOK.badlands.prop).toBe(0xff9f7a);
  });

  it('paints the low ground and the props of each cell with its biome, one colour per instance', () => {
    const view = new OpenWorldView(new World(byBiome));
    view.resize(1600, 900);
    view.show([0, 0]);
    for (const name of ['terrain-grass', 'prop-tree', 'prop-boulder']) {
      expect(mesh(view, name).instanceColor!.count).toBe(mesh(view, name).instanceMatrix.count);
    }
    const grounds = new Set(colourOf(view, 'terrain-grass'));
    for (const biome of ['meadow', 'tundra', 'desert', 'badlands', 'forest'] as const) {
      expect(grounds.has(BIOME_LOOK[biome].ground)).toBe(true);
    }
    const trees = new Set(colourOf(view, 'prop-tree'));
    for (const biome of ['tundra', 'desert', 'badlands'] as const) expect(trees.has(BIOME_LOOK[biome].prop)).toBe(true);
    expect(colourOf(view, 'prop-boulder').length).toBeGreaterThan(0);
  });

  it('keeps the colours when the meshes grow to hold a wide view (#1010)', () => {
    const view = new OpenWorldView(new World(byBiome));
    view.resize(1600, 900);
    view.show([0, 0]);
    const before = mesh(view, 'terrain-grass').instanceMatrix.count;
    view.zoomBy(MAX_ZOOM); // the widest zoom
    view.show([0, 0]);
    const grounds = mesh(view, 'terrain-grass');
    expect(grounds.instanceMatrix.count).toBeGreaterThanOrEqual(before);
    expect(grounds.instanceColor!.count).toBe(grounds.instanceMatrix.count);
    expect(new Set(colourOf(view, 'terrain-grass')).size).toBeGreaterThan(1);
  });
});
