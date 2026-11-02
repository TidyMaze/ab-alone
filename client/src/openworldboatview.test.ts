// @vitest-environment jsdom
import './test/openworldwasm';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import { CHUNK, World } from './openworld';
import { BOB_AMP } from './openworldboat';
import { GLIDE_MS } from './openworldglide';
import { MARBLE, OpenWorldView, topOf } from './openworldview';

// The hero and the troop sail on small boats (#1441, docs/specs/openworld.md section 4): water from q = 2 on, grass west of it.
const WATER_CODE = 0;
const GRASS_CODE = 2;
const world = (cx: number, cy: number): Uint8Array => {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, cx * CHUNK + (i % CHUNK) >= 2 ? WATER_CODE : GRASS_CODE, 0], i * 3);
  return out;
};
const view = (): OpenWorldView => {
  const v = new OpenWorldView(new World(world));
  v.resize(1600, 900);
  return v;
};
const boats = (v: OpenWorldView): THREE.InstancedMesh => v.scene.getObjectByName('boats') as THREE.InstancedMesh;
// The boats drawn, in the order of the marbles (the hero, then the troop), only the marbles on water: their place and their turn.
function drawn(v: OpenWorldView): { at: THREE.Vector3; yaw: number }[] {
  const mesh = boats(v);
  return Array.from({ length: mesh.count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    const at = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(at, q, scale);
    expect(scale.x).toBeCloseTo(1);
    return { at, yaw: new THREE.Euler().setFromQuaternion(q).y };
  });
}
const over = (point: THREE.Vector3, [q, r]: Axial): boolean => Math.hypot(point.x - axialTo3D(q, r).x, point.z - axialTo3D(q, r).z) < 1e-6;
const hero = (v: OpenWorldView): THREE.Object3D => v.scene.getObjectByName('hero')!;

describe('the boats of the hero and the troop on water (#1441)', () => {
  it('draws no boat on land, one shared geometry and material for every boat', () => {
    const v = view();
    v.show([0, 0], [[-1, 0], [-2, 0]]);
    expect(drawn(v)).toEqual([]);
    expect(v.drawn.boats).toBe(0);
    expect(boats(v).geometry.getAttribute('position').count / 3).toBeLessThanOrEqual(60);
  });

  it('puts a boat under each marble on water, on the water, and none under a marble on land', () => {
    const v = view();
    v.show([2, 0], [[1, 0], [3, 0]]);
    const [first, second, third] = drawn(v);
    expect(over(first!.at, [2, 0])).toBe(true);
    expect(over(second!.at, [3, 0])).toBe(true); // the troop marble on (1,0) is on land
    expect(third).toBeUndefined();
    expect(v.drawn.boats).toBe(2);
    expect(first!.at.y).toBeLessThan(topOf('water', 0, 2, 0) + 1e-9);
    expect(hero(v).position.y).toBeCloseTo(topOf('water', 0, 2, 0) + MARBLE); // the marble keeps its place and size on the boat
    expect(hero(v).scale.x).toBe(1);
  });

  it('turns each boat to the way its marble sails, and takes the boat away back on land', () => {
    const v = view();
    v.show([1, 0], [[0, 0]]);
    v.show([2, 0], [[1, 0]], { now: 0, span: GLIDE_MS });
    v.tick(GLIDE_MS);
    expect(drawn(v)[0]!.yaw).toBeCloseTo(0); // east: the bow on +x
    v.show([2, 1], [[2, 0]], { now: 1000, span: GLIDE_MS });
    v.tick(1000 + GLIDE_MS);
    const [boat, troop] = drawn(v);
    expect(boat!.yaw).toBeCloseTo(Math.atan2(-axialTo3D(0, 1).z, axialTo3D(0, 1).x)); // south-east
    expect(troop!.yaw).toBeCloseTo(0); // the troop marble sailed east onto (2,0)
    v.show([1, 1], [[2, 1]], { now: 2000, span: GLIDE_MS });
    v.tick(2000 + GLIDE_MS);
    expect(drawn(v).length).toBe(1); // the hero landed on (1,1): its boat is gone, the troop's sails on
    expect(over(drawn(v)[0]!.at, [2, 1])).toBe(true);
  });

  it('bobs the boat and its marble while the water moves, and holds them still under reduced motion', () => {
    const v = view();
    v.show([3, 0]);
    const rest = drawn(v)[0]!.at.y;
    const heights = [0, 300, 600, 900].map((ms) => {
      v.animate(ms, false);
      return [drawn(v)[0]!.at.y - rest, hero(v).position.y - topOf('water', 0, 3, 0) - MARBLE];
    });
    expect(new Set(heights.map(([boat]) => boat!.toFixed(4))).size).toBeGreaterThan(1);
    for (const [boat, marble] of heights) {
      expect(Math.abs(boat!)).toBeLessThanOrEqual(BOB_AMP + 1e-9);
      expect(marble).toBeCloseTo(boat!); // the marble rides its boat
    }
    v.animate(900, false);
    expect(v.bobAt).toBe(900); // the peers' boats bob at the same time (#1447)
    v.animate(1200, true);
    expect(v.bobAt).toBeNull();
    expect(drawn(v)[0]!.at.y).toBeCloseTo(rest);
    expect(hero(v).position.y).toBeCloseTo(topOf('water', 0, 3, 0) + MARBLE);
  });
});
