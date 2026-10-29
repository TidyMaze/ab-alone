// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { TUBE_POWER, TUBE_REACH, tubeLights } from './neonlight';

function tube(name: string, size: [number, number, number], position: [number, number, number], scale = 1, turn = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ emissive: 0x38e8ff, emissiveIntensity: 5.5 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.setScalar(scale);
  mesh.rotation.y = turn;
  return mesh;
}

describe('tubeLights', () => {
  it('lights a wall column for real: a row of short point lights along it, in its colour, one name for the row', () => {
    const lights = tubeLights(tube('corner-neon-nw', [0.14, 7.5, 0.14], [-8.4, 5.2, -17.35], 1.4));
    expect(lights).toHaveLength(5); // 10.5 m, one light every 2.5 m at most
    for (const light of lights) {
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(light.name).toBe('corner-neon-nw light');
      expect(light.color.getHex()).toBe(0x38e8ff);
      expect([light.intensity, light.distance]).toEqual([TUBE_POWER, TUBE_REACH]);
      expect([light.position.x, light.position.z]).toEqual([-8.4, -17.35]);
    }
    expect(lights.map((l) => l.position.y)).toEqual([1, 3.1, 5.2, 7.3, 9.4].map((y) => expect.closeTo(y)));
  });

  it('lays the row along a turned bar, round the pedestal', () => {
    const a = Math.PI / 6;
    const bar = tube('pedestal-neon-0', [3.2, 0.045, 0.07], [Math.cos(a) * 4.3, -0.27, Math.sin(a) * 4.3], 1, Math.PI / 2 - a);
    const lights = tubeLights(bar);
    expect(lights).toHaveLength(2);
    const length = new THREE.Vector3(1, 0, 0).applyQuaternion(bar.quaternion);
    for (const light of lights) {
      const offset = light.position.clone().sub(bar.position);
      expect(offset.length()).toBeCloseTo(0.8);
      expect(Math.abs(offset.normalize().dot(length))).toBeCloseTo(1);
    }
  });
});
