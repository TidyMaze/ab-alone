// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { CELL_LAYER, instanceCells, instanceMarbles } from './instancedcells';

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

describe('instanceMarbles (#885)', () => {
  const sphere = new THREE.SphereGeometry(0.36, 8, 4);
  const [shell, glass, fading, unseen] = [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial({ transparent: true }),
    new THREE.MeshBasicMaterial({ visible: false }),
  ];
  const marble = (look: THREE.Material, x: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(sphere, look);
    mesh.position.x = x;
    return mesh;
  };
  const drawnBy = (scene: THREE.Scene, look: THREE.Material): THREE.InstancedMesh | undefined =>
    scene.children.find((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.material === look && c.visible);

  it('draws the marbles as one instanced mesh per look, where each stands, the marbles left to a layer the camera skips', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.y = 1;
    const lift = new THREE.Group(); // a marble a door lifts sits one group deeper
    const [a, b, c] = [marble(shell, 1), marble(shell, 2), marble(glass, 3)];
    lift.add(c);
    group.add(a, b, lift, new THREE.Mesh(new THREE.BoxGeometry(), shell)); // the box is not a marble
    scene.add(group);
    instanceMarbles(group, sphere, scene)();
    const [shells, glasses] = [drawnBy(scene, shell)!, drawnBy(scene, glass)!];
    expect([shells.count, glasses.count]).toEqual([2, 1]);
    const m = new THREE.Matrix4();
    glasses.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([3, 1, 0]);
    const camera = new THREE.Camera();
    for (const o of [a, b, c]) expect(o.layers.test(camera.layers)).toBe(false);
    expect(group.children[3]!.layers.test(camera.layers)).toBe(true);
    expect(shells.frustumCulled).toBe(false);
  });

  it('follows the marbles each frame: a moved, hidden, removed or new marble, and a look no marble wears any more', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const [a, b] = [marble(shell, 1), marble(shell, 2)];
    group.add(a, b);
    scene.add(group);
    const sync = instanceMarbles(group, sphere, scene);
    sync();
    a.position.x = 5;
    b.visible = false;
    group.add(marble(glass, 7));
    sync();
    const shells = drawnBy(scene, shell)!;
    expect(shells.count).toBe(1);
    const m = new THREE.Matrix4();
    shells.getMatrixAt(0, m);
    expect(m.elements[12]).toBe(5);
    expect(drawnBy(scene, glass)!.count).toBe(1);
    group.clear();
    sync();
    expect([drawnBy(scene, shell), drawnBy(scene, glass)]).toEqual([undefined, undefined]); // nothing left to draw
  });

  it('leaves a see-through or unseen marble to be drawn as it is, its layer given back', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const a = marble(shell, 1);
    group.add(a, marble(unseen, 2));
    scene.add(group);
    const sync = instanceMarbles(group, sphere, scene);
    sync();
    a.material = fading; // an ejected marble fades out
    sync();
    expect(a.layers.test(new THREE.Camera().layers)).toBe(true);
    expect(drawnBy(scene, fading)).toBeUndefined();
    expect(drawnBy(scene, unseen)).toBeUndefined();
  });

  it('makes room when more marbles wear one look than it held', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const sync = instanceMarbles(group, sphere, scene);
    group.add(marble(shell, 0));
    sync();
    for (let i = 1; i < 100; i++) group.add(marble(shell, i));
    sync();
    expect(drawnBy(scene, shell)!.count).toBe(100);
  });
});
