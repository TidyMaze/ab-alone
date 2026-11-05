import './test/openworldwasm';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, World } from './openworld';
import { GROUND, LOG_LOOK, OpenWorldView, topOf } from './openworldview';

// The look of a lore log in the Open world (#1589, docs/specs/openworld.md section 12): a tall amber stake on its cell while unread,
// a short grey one once found. Grass everywhere in the square -12..12 of chunks, at level 2.
function grass(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 12 || Math.abs(cy) > 12) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
const placed = (view: OpenWorldView, name: string): THREE.Vector3[] =>
  Array.from({ length: mesh(view, name).count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh(view, name).getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  });
const height = (view: OpenWorldView, name: string): number => {
  const box = new THREE.Box3().setFromBufferAttribute(mesh(view, name).geometry.getAttribute('position') as THREE.BufferAttribute);
  return box.max.y - box.min.y;
};

describe('the look of a lore log (#1589)', () => {
  it('stands a stake on each log of the loaded chunks, none farther: an amber one when unread, a grey one when found', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK, 0];
    view.setLogs([[3, 0], [-2, 1], far], [1]);
    const open = placed(view, 'log-stake');
    const found = placed(view, 'log-stake-found');
    expect(open).toHaveLength(1);
    expect(found).toHaveLength(1);
    const p = axialTo3D(3, 0);
    expect([open[0]!.x, open[0]!.z]).toEqual([p.x, p.z].map((v) => expect.closeTo(v)));
    expect(open[0]!.y).toBeCloseTo(topOf(GROUND.grass, 2, 3, 0));
    expect(found[0]!.x).toBeCloseTo(axialTo3D(-2, 1).x);
    expect((mesh(view, 'log-stake').material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(LOG_LOOK.open);
    expect((mesh(view, 'log-stake-found').material as THREE.MeshStandardMaterial).color.getHex()).toBe(LOG_LOOK.found);
    expect(mesh(view, 'log-stake').castShadow).toBe(true);
  });

  it('changes the shape when found, not only the colour: the found stake is shorter', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    view.setLogs([[3, 0]], []);
    expect(height(view, 'log-stake-found')).toBeLessThan(height(view, 'log-stake'));
  });

  it('lays the ones of the new chunks when the loaded square moves', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK + 3, 0];
    view.setLogs([[3, 0], far], []);
    expect(mesh(view, 'log-stake').count).toBe(1);
    view.show(far);
    expect(placed(view, 'log-stake').some((v) => Math.abs(v.x - axialTo3D(...far).x) < 1e-6)).toBe(true);
  });
});
