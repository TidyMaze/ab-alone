// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { TUBE_POWER, tubeLight } from './neonlight';

function tube(name: string, size: [number, number, number], position: [number, number, number], scale = 1, turn = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ emissive: 0x38e8ff, emissiveIntensity: 5.5 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.setScalar(scale);
  mesh.rotation.y = turn;
  return mesh;
}
/** Where a light shines: three.js turns a light's -Z to what it looks at. */
const facing = (light: THREE.Object3D): THREE.Vector3 => new THREE.Vector3(0, 0, -1).applyQuaternion(light.quaternion);

describe('tubeLight', () => {
  it('lights a wall column for real: a rect light its size, place and colour, facing the board', () => {
    const light = tubeLight(tube('corner-neon-nw', [0.14, 7.5, 0.14], [-8.4, 5.2, -17.35], 1.4));
    expect(light).toBeInstanceOf(THREE.RectAreaLight);
    expect(light.name).toBe('corner-neon-nw light');
    expect([light.width, light.height]).toEqual([expect.closeTo(0.196), expect.closeTo(10.5)]);
    expect(light.position.toArray()).toEqual([-8.4, 5.2, -17.35]);
    expect(light.color.getHex()).toBe(0x38e8ff);
    expect(light.intensity).toBe(TUBE_POWER);
    expect(facing(light).dot(light.position.clone().negate().normalize())).toBeGreaterThan(0.999);
  });

  it('turns a bar round the pedestal outward, along its length', () => {
    const a = Math.PI / 6;
    const bar = tube('pedestal-neon-0', [3.2, 0.045, 0.07], [Math.cos(a) * 4.3, -0.27, Math.sin(a) * 4.3], 1, Math.PI / 2 - a);
    const light = tubeLight(bar);
    expect(light.width).toBeCloseTo(3.2);
    expect(facing(light).dot(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))).toBeGreaterThan(0.999);
    const length = new THREE.Vector3(1, 0, 0).applyQuaternion(bar.quaternion);
    expect(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(light.quaternion).dot(length))).toBeGreaterThan(0.999);
  });
});
