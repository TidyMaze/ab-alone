import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { BOAT_LOOK, BOB_AMP, BOB_MS, bob, boatGeometry, boatMaterial, steer, TURN, type Wake } from './openworldboat';

const MARBLE = 0.3;

describe('the low-poly boat of a marble on water (#1441, docs/specs/openworld.md section 4)', () => {
  it('is a hull and a sail of a few dozen triangles, coloured by its vertices', () => {
    const geometry = boatGeometry(MARBLE);
    const triangles = geometry.getAttribute('position').count / 3;
    expect(triangles).toBeGreaterThanOrEqual(12);
    expect(triangles).toBeLessThanOrEqual(60);
    expect(geometry.getAttribute('normal').count).toBe(triangles * 3);
    const colours = geometry.getAttribute('color');
    const seen = new Set<number>();
    for (let i = 0; i < colours.count; i++) seen.add(new THREE.Color(colours.getX(i), colours.getY(i), colours.getZ(i)).getHex());
    expect([...seen].sort()).toEqual([BOAT_LOOK.hull, BOAT_LOOK.sail].sort());
  });

  it('holds the marble: longer and wider than it, the bow on +x, the sail standing over the marble', () => {
    const geometry = boatGeometry(MARBLE);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeGreaterThan(2 * MARBLE);
    expect(box.max.z - box.min.z).toBeGreaterThan(2 * MARBLE);
    expect(box.max.x - box.min.x).toBeLessThan(1); // within its cell: two boats side by side never cross
    expect(box.max.x).toBeGreaterThan(-box.min.x); // the bow is the long end
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBeGreaterThan(2 * MARBLE); // the sail stands over the marble's top
  });

  it('has one flat-shaded material whose colours are the vertices', () => {
    const material = boatMaterial();
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(true);
  });

  it('turns to the way the marble went, once it went far enough, and keeps its heading for a lean', () => {
    const wake: Wake = { x: 0, z: 0, yaw: 0 };
    steer(wake, TURN / 2, 0);
    expect(wake).toEqual({ x: 0, z: 0, yaw: 0 }); // a lean (0.2 cell) or a short way: no turn
    steer(wake, 0, -1); // to -z: the bow (+x) turns a quarter left
    expect(wake.yaw).toBeCloseTo(Math.PI / 2);
    expect([wake.x, wake.z]).toEqual([0, -1]);
    steer(wake, -1, -1);
    expect(Math.abs(wake.yaw)).toBeCloseTo(Math.PI);
    const bow = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, Math.atan2(-1, 1), 0));
    expect(bow.x).toBeCloseTo(Math.SQRT1_2);
    expect(bow.z).toBeCloseTo(-Math.SQRT1_2); // a yaw of atan2(-dz, dx) points the bow along (dx, dz)
  });

  it('bobs gently, each boat on its own phase, and is held still under reduced motion', () => {
    expect(bob(null, 0)).toBe(0);
    expect(bob(null, 3)).toBe(0);
    expect(bob(BOB_MS / 4, 0)).toBeCloseTo(BOB_AMP);
    expect(bob(0, 0)).toBeCloseTo(0);
    expect(bob(0, 1)).not.toBeCloseTo(bob(0, 2));
    for (let ms = 0; ms < BOB_MS; ms += 97) expect(Math.abs(bob(ms, 5))).toBeLessThanOrEqual(BOB_AMP + 1e-9);
    expect(BOB_AMP).toBeLessThan(0.1 * MARBLE * 2);
  });
});
