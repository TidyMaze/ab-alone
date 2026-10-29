// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { RING, ringLamp } from './ringlamp';

describe('ringLamp (#879)', () => {
  it('hangs a dark ring wider than the board over its centre, its lower face glowing, by 3 cables up to the ceiling', () => {
    const { meshes } = ringLamp();
    const named = (name: string): THREE.Mesh[] => meshes.filter((m) => m.name === name);
    const [shell] = named('ring-lamp');
    const [face] = named('ring-lamp face');
    expect(named('ring-lamp')).toHaveLength(1);
    expect(RING.radius).toBeGreaterThan(5); // the board's radius, rim included
    expect(shell!.position.y).toBe(RING.y);
    expect(((shell!.material as THREE.MeshStandardMaterial).color.getHex())).toBeLessThan(0x202020); // matte black outside
    expect(face!.position.y).toBeLessThan(RING.y); // under the shell: the face looks down
    expect((face!.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    const cables = named('ring-lamp cable');
    expect(cables).toHaveLength(3);
    for (const c of cables) {
      c.geometry.computeBoundingBox();
      const top = c.position.y + c.geometry.boundingBox!.max.y;
      expect(top).toBeCloseTo(RING.ceiling);
      expect(Math.hypot(c.position.x, c.position.z)).toBeCloseTo(RING.radius); // hung from the ring itself
    }
    expect(new Set(cables.map((c) => `${c.position.x.toFixed(2)} ${c.position.z.toFixed(2)}`)).size).toBe(3); // spread round it
  });

  it('backs the face with a ring of point lights named for ?lights, white, one every 2.5 m at most', () => {
    const { lights } = ringLamp(2.5);
    expect(lights).toHaveLength(Math.ceil((2 * Math.PI * RING.radius) / 2.5));
    for (const light of lights) {
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(light.name).toBe('ring-lamp light');
      expect(light.color.getHex()).toBe(0xffffff);
      expect(light.distance).toBe(RING.reach);
      expect(Math.hypot(light.position.x, light.position.z)).toBeCloseTo(RING.radius);
      expect(light.position.y).toBeLessThan(RING.y); // on the face
    }
    expect(new Set(lights.map((l) => l.position.x.toFixed(3))).size).toBeGreaterThan(lights.length / 2);
  });

  it('keeps a few lights where the renderer cannot cull them per pixel (spacing Infinity)', () => {
    expect(ringLamp(Infinity).lights).toHaveLength(RING.fewLights);
  });
});
