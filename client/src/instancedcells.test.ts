// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { CELL_LAYER, instanceCells } from './instancedcells';

const discGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
const bevelGeometry = new THREE.TorusGeometry(0.44, 0.03, 4, 8);
const [steel, edge] = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
function cells(n: number): THREE.Mesh[] {
  return Array.from({ length: n }, (_, i) => {
    const disc = new THREE.Mesh(discGeometry, steel);
    const bevel = new THREE.Mesh(bevelGeometry, edge);
    bevel.position.y = 0.05;
    disc.add(bevel);
    disc.position.set(i, -0.05, -i);
    disc.rotation.y = i;
    return disc;
  });
}
const at = (mesh: THREE.InstancedMesh, i: number): THREE.Matrix4 => {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return m;
};
// The instances are stored as 32-bit floats.
const same = (a: THREE.Matrix4, b: THREE.Matrix4): void => a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i]!, 6));

describe('instanceCells (#885)', () => {
  it('draws the discs and their bevels as two instanced meshes beside them, the discs left to picking only', () => {
    const parent = new THREE.Group();
    const discs = cells(3);
    parent.add(...discs);
    const [drawnDiscs, drawnBevels] = instanceCells(discs, parent);
    expect(parent.children).toContain(drawnDiscs);
    expect(parent.children).toContain(drawnBevels);
    expect([drawnDiscs!.count, drawnDiscs!.geometry, drawnDiscs!.material]).toEqual([3, discGeometry, steel]);
    expect([drawnBevels!.count, drawnBevels!.geometry, drawnBevels!.material]).toEqual([3, bevelGeometry, edge]);
    const camera = new THREE.Camera();
    for (const disc of discs) {
      expect(disc.layers.test(camera.layers)).toBe(false); // the camera skips them
      expect(disc.children[0]!.layers.test(camera.layers)).toBe(false);
      expect(disc.layers.isEnabled(CELL_LAYER)).toBe(true);
    }
  });

  it('copies each disc and bevel where it stands just before drawing, a hidden disc at scale 0', () => {
    const parent = new THREE.Group();
    const discs = cells(2);
    parent.add(...discs);
    const [drawnDiscs, drawnBevels] = instanceCells(discs, parent);
    discs[0]!.position.y = -1; // a sinking cell
    discs[1]!.visible = false; // a vanished cell
    drawnDiscs!.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    discs[0]!.updateMatrix();
    same(at(drawnDiscs!, 0), discs[0]!.matrix);
    same(at(drawnBevels!, 0), discs[0]!.matrix.clone().multiply(discs[0]!.children[0]!.matrix));
    expect(new THREE.Vector3().setFromMatrixScale(at(drawnDiscs!, 1)).length()).toBe(0);
    expect(new THREE.Vector3().setFromMatrixScale(at(drawnBevels!, 1)).length()).toBe(0);
    expect(drawnDiscs!.instanceMatrix.version).toBeGreaterThan(0);
    expect(drawnBevels!.instanceMatrix.version).toBeGreaterThan(0);
  });

  it('is always drawn: the board is never out of view, and its bounds would need recomputing on every move', () => {
    const parent = new THREE.Group();
    const discs = cells(1);
    parent.add(...discs);
    for (const mesh of instanceCells(discs, parent)) expect(mesh.frustumCulled).toBe(false);
  });
});
