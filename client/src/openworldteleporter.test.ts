import './test/openworldwasm';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, World } from './openworld';
import { GROUND, OpenWorldView, TELEPORTER_LOOK, topOf } from './openworldview';

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

describe('the look of a teleporter (#1412)', () => {
  const mesh = (view: OpenWorldView, name: string) => view.scene.getObjectByName(name) as THREE.InstancedMesh;
  const placed = (view: OpenWorldView, name: string): THREE.Vector3[] =>
    Array.from({ length: mesh(view, name).count }, (_, i) => {
      const m = new THREE.Matrix4();
      mesh(view, name).getMatrixAt(i, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    });

  it('stands a glowing pad and a ring over it on the top of each teleporter of the loaded chunks, none farther', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK, 0];
    view.setTeleporters([[3, 0], [-2, 1], far]);
    const pads = placed(view, 'teleporter-pad');
    expect(pads).toHaveLength(2);
    const p = axialTo3D(3, 0);
    expect(pads[0]!.x).toBeCloseTo(p.x);
    expect(pads[0]!.y).toBeCloseTo(topOf(GROUND.grass, 5, 3, 0)); // on the lifted ground (#1418)
    expect(pads[0]!.z).toBeCloseTo(p.z);
    expect(placed(view, 'teleporter-ring')).toEqual(pads);
    const look = mesh(view, 'teleporter-pad').material as THREE.MeshStandardMaterial;
    expect(look.emissive.getHex()).toBe(TELEPORTER_LOOK.colour);
    expect(mesh(view, 'teleporter-pad').castShadow).toBe(true);
  });

  it('lays the ones of the new chunks when the loaded square moves', () => {
    const view = new OpenWorldView(new World(grass));
    view.show([0, 0]);
    const far: Axial = [(view.reach + 1) * CHUNK + 3, 0];
    view.setTeleporters([[3, 0], far]);
    expect(mesh(view, 'teleporter-pad').count).toBe(1);
    view.show(far);
    const pads = placed(view, 'teleporter-pad');
    expect(pads.some((v) => Math.abs(v.x - axialTo3D(...far).x) < 1e-6)).toBe(true);
  });
});
