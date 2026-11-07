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
