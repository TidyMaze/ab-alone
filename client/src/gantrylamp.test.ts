// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { frameShape } from './frame';
import { GantryLamp } from './gantrylamp';
import { LIGHT } from './light';

// The gantries as main.ts places them once the bay is in, and in the bare room.
const gantry = (x: number, y: number, z: number): THREE.Object3D => {
  const bar = new THREE.Object3D();
  bar.position.set(x, y, z);
  return bar;
};
const north = (): THREE.Object3D => gantry(0, 13.05, -8.4);
const south = (): THREE.Object3D => gantry(0, 13.05, 8.4);

const lens = (lamp: GantryLamp): THREE.Mesh => lamp.fixture.getObjectByName('lens') as THREE.Mesh;
const world = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());
const hung = (name: string, bar: THREE.Object3D, cone = LIGHT.spots.key): GantryLamp => {
  const lamp = new GantryLamp(name, cone);
  lamp.hang(bar);
  lamp.fixture.updateMatrixWorld(true);
  return lamp;
};

describe('GantryLamp (#864)', () => {
  it('is a spotlight named for its role, with the cone it is given and no falloff', () => {
    const { light, fixture } = new GantryLamp('key', LIGHT.spots.key);
    expect(light).toBeInstanceOf(THREE.SpotLight);
    expect([light.name, light.angle, light.penumbra]).toEqual(['key', LIGHT.spots.key.angle, LIGHT.spots.key.penumbra]);
    expect([light.decay, light.distance]).toEqual([0, 0]); // the intensity reads as a directional light's
    expect(fixture.name).toBe('key fixture'); // not a neon: no glow slider in ?lights
    expect(light.target.position.toArray()).toEqual([0, 0, 0]); // the board's centre
  });

  it('hangs under the gantry, the lens turned on the board, the light leaving from the lens', () => {
    const bar = north();
    const lamp = hung('key', bar);
    expect([lamp.fixture.position.x, lamp.fixture.position.z]).toEqual([0, -8.4]);
    expect(lamp.fixture.position.y).toBeLessThan(bar.position.y);
    const at = world(lens(lamp));
    expect(lamp.light.position.toArray()).toEqual(at.toArray());
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(lens(lamp).getWorldQuaternion(new THREE.Quaternion()));
    expect(facing.dot(at.clone().negate().normalize())).toBeCloseTo(1); // the board's centre is at the origin
    expect(at.y).toBeLessThan(bar.position.y);
  });

  it('follows its gantry when the props are drawn again, the bare room and the bay each in their place', () => {
    const lamp = hung('key', north());
    lamp.hang(gantry(0, 14.2, -12));
    lamp.fixture.updateMatrixWorld(true);
    const bare = lamp.light.position.clone();
    lamp.hang(north());
    lamp.hang(north()); // twice the same: no drift
    lamp.fixture.updateMatrixWorld(true);
    expect(lamp.light.position.y).toBeLessThan(bare.y);
    expect(lamp.light.position.equals(hung('key', north()).light.position)).toBe(true);
  });

  it.each([
    ['key', north, LIGHT.spots.key],
    ['fill', south, LIGHT.spots.fill],
  ])('the %s cone holds the whole board, the radius-5 one of The Ballast Mind and its rim', (name, bar, cone) => {
    const { light } = hung(name, bar(), cone);
    const axis = light.position.clone().negate().normalize();
    for (const { x, z } of frameShape(Array<number>(91).fill(0)).outer) {
      const toCorner = new THREE.Vector3(x, 0, z).sub(light.position).normalize();
      expect(Math.acos(axis.dot(toCorner))).toBeLessThan(cone.angle);
    }
  });

  it('tints the light and makes its lens glow in the same colour', () => {
    const lamp = hung('key', north());
    lamp.tint(0xd9822b);
    const glass = lens(lamp).material as THREE.MeshStandardMaterial;
    expect([lamp.light.color.getHex(), glass.emissive.getHex()]).toEqual([0xd9822b, 0xd9822b]);
    expect(glass.emissiveIntensity).toBeGreaterThan(1);
  });
});
