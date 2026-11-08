import './test/openworldwasm';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, World } from './openworld';
import { ICON } from './openworldlairicon';
import { GROUND, OpenWorldView, PLACE_LOOK, topOf } from './openworldview';

// Grass everywhere in the square -12..12 of chunks, at level 2, and level 5 on (3, 0).
function grass(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 12 || Math.abs(cy) > 12) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const q = cx * CHUNK + (i % CHUNK);
    const r = cy * CHUNK + Math.floor(i / CHUNK);
    out.set([q === 3 && r === 0 ? 5 : 2, 2, 0], i * 3);
  }
  return out;
}

// The marker of a place in the world (#1593): the teleporter's pad, green on a town and orange on a dungeon gate (the map icons' colours).
describe('the marker of a town and a dungeon gate (#1593)', () => {
  const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
  const placed = (view: OpenWorldView, name: string): THREE.Vector3[] =>
    Array.from({ length: mesh(view, name).count }, (_, i) => {
      const m = new THREE.Matrix4();
      mesh(view, name).getMatrixAt(i, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    });

  it('stands a green pad on each town and an orange one on each gate of the loaded chunks, none farther, on the lifted ground', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK, 0];
    view.setPlaces([
      { kind: 'town', cell: [3, 0] },
      { kind: 'dungeon', cell: [-2, 1] },
      { kind: 'town', cell: far },
    ]);
    const towns = placed(view, 'town-pad');
    expect(towns).toHaveLength(1);
    const p = axialTo3D(3, 0);
    expect([towns[0]!.x, towns[0]!.y, towns[0]!.z]).toEqual([expect.closeTo(p.x), expect.closeTo(topOf(GROUND.grass, 5, 3, 0)), expect.closeTo(p.z)]);
    expect(placed(view, 'gate-pad')).toHaveLength(1);
    expect((mesh(view, 'town-pad').material as THREE.MeshStandardMaterial).emissive.getStyle()).toBe(new THREE.Color(ICON.town).getStyle());
    expect((mesh(view, 'gate-pad').material as THREE.MeshStandardMaterial).emissive.getStyle()).toBe(new THREE.Color(ICON.dungeon).getStyle());
    expect(mesh(view, 'town-pad').castShadow).toBe(true);
  });

  it('lays the ones of the new chunks when the loaded square moves', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK + 3, 0];
    view.setPlaces([{ kind: 'dungeon', cell: far }]);
    expect(mesh(view, 'gate-pad').count).toBe(0);
    view.show(far);
    expect(mesh(view, 'gate-pad').count).toBe(1);
  });
});

// The silhouette of a town and a gate from far away (#1518): a tall green spire on each town, a wide orange arch on each gate.
describe('the silhouette of a town and a gate from far away (#1518)', () => {
  const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
  const size = (view: OpenWorldView, name: string): THREE.Vector3 => {
    const geometry = mesh(view, name).geometry;
    geometry.computeBoundingBox();
    return geometry.boundingBox!.getSize(new THREE.Vector3());
  };

  it('stands a spire on each town and an arch on each gate, on the same cell and top as its pad', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    view.setPlaces([
      { kind: 'town', cell: [3, 0] },
      { kind: 'dungeon', cell: [-2, 1] },
    ]);
    expect(mesh(view, 'town-spire').count).toBe(1);
    expect(mesh(view, 'gate-arch').count).toBe(1);
    const pad = new THREE.Matrix4();
    const spire = new THREE.Matrix4();
    const arch = new THREE.Matrix4();
    mesh(view, 'town-pad').getMatrixAt(0, pad);
    mesh(view, 'town-spire').getMatrixAt(0, spire);
    expect(spire.elements).toEqual(pad.elements);
    mesh(view, 'gate-pad').getMatrixAt(0, pad);
    mesh(view, 'gate-arch').getMatrixAt(0, arch);
    expect(arch.elements).toEqual(pad.elements);
  });

  it('the spire is tall and narrow, the arch wide and low, and both glow in the colour of their kind', () => {
    const view = new OpenWorldView(new World(grass));
    const spire = size(view, 'town-spire');
    const arch = size(view, 'gate-arch');
    expect(spire.y).toBeGreaterThanOrEqual(2);
    expect(spire.y).toBeGreaterThan(spire.x * 3);
    expect(arch.x).toBeGreaterThan(arch.y * 1.5);
    expect((mesh(view, 'town-spire').material as THREE.MeshStandardMaterial).emissive.getStyle()).toBe(new THREE.Color(PLACE_LOOK.spire.colour).getStyle());
    expect((mesh(view, 'gate-arch').material as THREE.MeshStandardMaterial).emissive.getStyle()).toBe(new THREE.Color(PLACE_LOOK.arch.colour).getStyle());
    expect(PLACE_LOOK.spire.colour).toBe('#19e6ff'); // the art spec's neon cyan (docs/specs/art.md section 1)
    expect(PLACE_LOOK.arch.colour).toBe('#d9822b'); // the art spec's sodium hazard (docs/specs/art.md section 1)
  });
});

// The gate reads as a mouth going down (#1518): treads under the arch, darker step by step toward the back, the last one the gap floor.
describe('the mouth of a dungeon gate (#1518)', () => {
  const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
  const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  it('lies flat on each gate pad, under the arch, inside the pad, and gets darker toward the back, down to the gap floor', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    view.setPlaces([
      { kind: 'town', cell: [3, 0] },
      { kind: 'dungeon', cell: [-2, 1] },
    ]);
    const mouth = mesh(view, 'gate-mouth');
    expect(mouth.count).toBe(1);
    const pad = new THREE.Matrix4();
    const at = new THREE.Matrix4();
    mesh(view, 'gate-pad').getMatrixAt(0, pad);
    mouth.getMatrixAt(0, at);
    expect(at.elements).toEqual(pad.elements);
    const geometry = mouth.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.y).toBeGreaterThan(0.08); // over the pad's top
    expect(box.max.y).toBeLessThan(0.1); // flat
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) expect(Math.hypot(x, z)).toBeLessThanOrEqual(0.5); // inside the pad
    expect(box.max.x - box.min.x).toBeLessThan(PLACE_LOOK.arch.radius * 2); // between the arch's legs
    expect(geometry.attributes.position!.count / 3).toBeLessThanOrEqual(24);
    // the tone by depth: the front tread is the lightest, the last one at the back the gap floor
    const { position, color } = geometry.attributes as { position: THREE.BufferAttribute; color: THREE.BufferAttribute };
    const byZ = new Map<number, number>();
    for (let i = 0; i < position.count; i++) {
      const z = Math.round(position.getZ(i) * 100);
      byZ.set(z, Math.min(byZ.get(z) ?? 9, luma(color.getX(i), color.getY(i), color.getZ(i))));
    }
    const tones = [...byZ.entries()].sort(([a], [b]) => b - a).map(([, l]) => l);
    expect(tones[0]).toBeGreaterThan(tones[tones.length - 1]! * 4);
    const floor = new THREE.Color(PLACE_LOOK.mouth.floor);
    expect(tones[tones.length - 1]).toBeCloseTo(luma(floor.r, floor.g, floor.b), 5);
    expect(PLACE_LOOK.mouth.floor).toBe('#020307'); // the art spec's gap floor
    expect((mouth.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect(mouth.castShadow).toBe(false);
  });
});

// The town reads as a place (#1518): a ring of six small huts round the spire, on the corners between the cells round the pad.
describe('the huts of a town (#1518)', () => {
  const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
  const matrix = (m: THREE.InstancedMesh, i: number): THREE.Matrix4 => {
    const out = new THREE.Matrix4();
    m.getMatrixAt(i, out);
    return out;
  };

  it('stands six huts round each town of the loaded chunks, facing the spire, on the highest of the three cells at their corner', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    view.setPlaces([
      { kind: 'town', cell: [2, 0] },
      { kind: 'dungeon', cell: [-2, 1] },
      { kind: 'town', cell: [-3, 0] },
      { kind: 'town', cell: [(view.reach + 1) * CHUNK, 0] },
    ]);
    const huts = mesh(view, 'town-hut');
    const windows = mesh(view, 'town-window');
    expect(huts.count).toBe(12);
    expect(windows.count).toBe(12);
    const centre = axialTo3D(2, 0);
    const top = ([q, r]: Axial): number => topOf(GROUND.grass, q === 3 && r === 0 ? 5 : 2, q, r);
    // the three cells at each corner, counterclockwise from the east: (3, 0), next to the town, stands at level 5 and lifts two huts
    const corners: Axial[][] = [
      [[3, 0], [2, 1], [3, 1]],
      [[2, 1], [1, 1], [1, 2]],
      [[1, 1], [1, 0], [0, 1]],
      [[1, 0], [2, -1], [1, -1]],
      [[2, -1], [3, -1], [3, -2]],
      [[3, -1], [3, 0], [4, -1]],
    ];
    const heights: number[] = [];
    for (let i = 0; i < 6; i++) {
      const m = matrix(huts, i);
      expect(matrix(windows, i).elements).toEqual(m.elements);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeCloseTo(2 / Math.sqrt(3), 5);
      expect(p.y).toBeCloseTo(Math.max(...corners[i]!.map(top)), 5);
      heights.push(p.y);
      const facing = new THREE.Vector3(0, 0, 1).transformDirection(m);
      const inward = new THREE.Vector3(centre.x - p.x, 0, centre.z - p.z).normalize();
      expect(facing.dot(inward)).toBeGreaterThan(0.999);
    }
    expect(heights.filter((y) => Math.abs(y - top([3, 0])) < 1e-5)).toHaveLength(2);
  });

  it('is a slate hut with a pyramid roof and a lit cyan window front and back, the window the only light, few triangles', () => {
    const view = new OpenWorldView(new World(grass));
    const hut = mesh(view, 'town-hut');
    const window = mesh(view, 'town-window');
    const tris = (g: THREE.BufferGeometry): number => g.attributes.position!.count / 3;
    expect(tris(hut.geometry) + tris(window.geometry)).toBeLessThanOrEqual(40);
    hut.geometry.computeBoundingBox();
    const box = hut.geometry.boundingBox!;
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(0.4); // clear of the marbles round it (0.58 away, 0.3 round)
    expect(box.min.y).toBeLessThan(-0.2); // a plinth into the lower ground, so it never floats
    const body = hut.material as THREE.MeshStandardMaterial;
    expect(body.emissive.getHex()).toBe(0);
    expect(body.color.getStyle()).toBe(new THREE.Color(PLACE_LOOK.hut.colour).getStyle());
    expect(PLACE_LOOK.hut.colour).toBe('#5d6a82'); // the art spec's cell slate
    expect((window.material as THREE.MeshStandardMaterial).emissive.getStyle()).toBe(new THREE.Color(PLACE_LOOK.spire.colour).getStyle());
    window.geometry.computeBoundingBox();
    expect(window.geometry.boundingBox!.max.z).toBeGreaterThan(PLACE_LOOK.hut.width / 2); // on the hut's front face
    expect(window.geometry.boundingBox!.min.z).toBeLessThan(-PLACE_LOOK.hut.width / 2); // and its back one
  });
});
