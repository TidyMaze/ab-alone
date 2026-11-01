import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SUN, addSun, mergeByMaterial, sunPosition, tableZeroActive, terraceMaterial } from './tablezero';

describe('Table Zero is the scene of a 1v1 game only', () => {
  const on = { hub: false, fight: false, royale: false, run: false, room: false, ready: true };
  it('is on for a plain game once the arena has loaded', () => expect(tableZeroActive(on)).toBe(true));
  it('waits for the arena file', () => expect(tableZeroActive({ ...on, ready: false })).toBe(false));
  it.each(['hub', 'fight', 'royale', 'run', 'room'] as const)('is off in %s', (k) => expect(tableZeroActive({ ...on, [k]: true })).toBe(false));
});

describe('the light of the terrace', () => {
  it('has one sun and a hemisphere, no point light', () => {
    const group = new THREE.Group();
    const lights = addSun(group);
    expect(lights.map((l) => l.type).sort()).toEqual(['DirectionalLight', 'HemisphereLight']);
    expect(group.children).toHaveLength(2);
    expect(lights[1].color.getHex()).toBe(SUN.colour);
  });
  it('puts the sun at its elevation, 25 degrees left of the camera axis', () => {
    const [x, y, z] = sunPosition(10);
    expect(Math.asin(y / 10) * (180 / Math.PI)).toBeCloseTo(SUN.elevation);
    expect(x).toBeLessThan(0);
    expect(Math.atan2(-x, z) * (180 / Math.PI)).toBeCloseTo(25);
    expect(Math.hypot(x, y, z)).toBeCloseTo(10);
    expect(sunPosition()).toHaveLength(3);
  });
  it('keeps the palette of the direction', () => {
    expect([PALETTE.dish, PALETTE.gap, PALETTE.whiteClamp]).toEqual([0xb4aa81, 0x2c3438, 0xe8e4d6]);
  });
});

describe('the arena file is drawn in one mesh per material', () => {
  const box = (x: number, material: THREE.Material): THREE.Mesh => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 3).fill(0.5), 3));
    const mesh = new THREE.Mesh(g, material);
    mesh.position.x = x;
    return mesh;
  };
  it('merges the nodes of a material, in world space, and drops what the game draws itself', () => {
    const [a, b] = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.y = 2;
    const [m1, m2, m3, m4] = [box(0, a), box(3, a), box(5, b), box(7, a)];
    m4.name = 'scene_marble_white_0'; // the game's own marbles are drawn by the game
    parent.add(m1, m2, m3, m4);
    root.add(parent);
    const merged = mergeByMaterial(root);
    expect(merged.children).toHaveLength(2);
    const [first, second] = merged.children as THREE.Mesh[];
    expect(first!.material).toBe(a);
    expect(first!.geometry.attributes.position!.count).toBe(2 * 24);
    first!.geometry.computeBoundingBox();
    expect([first!.geometry.boundingBox!.min.y, first!.geometry.boundingBox!.max.x]).toEqual([1.5, 3.5]); // lifted by its parent
    expect(second!.material).toBe(b);
    expect(first!.frustumCulled).toBe(false);
    expect(first!.geometry.attributes.uv).toBeUndefined();
  });
  it('draws a blended material after the solid ones, without writing depth', () => {
    const haze = new THREE.MeshStandardMaterial({ transparent: true });
    const root = new THREE.Group();
    root.add(box(0, haze));
    const [mesh] = mergeByMaterial(root).children as THREE.Mesh[];
    expect([mesh!.renderOrder, haze.depthWrite]).toEqual([1, false]);
  });
  it('keeps the turn bars as meshes of their own, where they stand in the world', () => {
    const root = new THREE.Group();
    root.position.z = 4;
    const bar = box(1, new THREE.MeshStandardMaterial());
    bar.name = 'scene_turnbar_black';
    root.add(bar);
    const merged = mergeByMaterial(root);
    expect(merged.children).toEqual([bar]);
    expect([bar.position.x, bar.position.z]).toEqual([1, 4]);
  });
});

describe('the unlit materials of the arena file', () => {
  const named = (name: string): THREE.Material => Object.assign(new THREE.MeshStandardMaterial({ emissive: 0xffffff }), { name });
  it('draw their vertex colours, not the white of their emissive factor', () => {
    const sky = terraceMaterial(named('kit_mat_sky')) as THREE.MeshBasicMaterial;
    expect([sky.isMeshBasicMaterial, sky.vertexColors, sky.transparent]).toEqual([true, true, false]);
    expect(terraceMaterial(named('kit_mat_emissive'))).not.toBe(sky);
    expect(terraceMaterial(named('kit_mat_sky'))).toBe(sky); // one material per name
  });
  it('blend the haze and the shadow, and leave the lit material as it is', () => {
    expect(terraceMaterial(named('kit_mat_alpha_haze')).transparent).toBe(true);
    const lit = named('kit_mat_vertexcolor');
    expect(terraceMaterial(lit)).toBe(lit);
  });
});
