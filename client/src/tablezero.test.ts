import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SUN, addSun, mergeByMaterial, sunPosition, tableZeroActive, terraceMaterial, terraceEnvironment, saturateColours, isDefaultView, TERRACE_VIEW, TERRACE_EXPOSURE, TERRACE_TINT } from './tablezero';

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
  const lamp = (): THREE.Material => new THREE.MeshStandardMaterial({ emissive: 0xffffff });
  const colours = (alpha: number[], size = 4): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(alpha.flatMap((a) => (size === 4 ? [1, 1, 1, a] : [1, 1, 1]))), size));
    return g;
  };
  it('draw their vertex colours, not the white of their emissive factor, one material for the solid ones', () => {
    const sky = terraceMaterial(lamp(), colours([1, 1])) as THREE.MeshBasicMaterial;
    expect([sky.isMeshBasicMaterial, sky.vertexColors, sky.transparent]).toEqual([true, true, false]);
    expect(sky.color.r).toBeCloseTo(1 / TERRACE_EXPOSURE); // the exposure does not brighten what is already a colour of the render
    expect(terraceMaterial(lamp(), colours([1], 3))).toBe(sky);
    expect(terraceMaterial(lamp(), new THREE.BufferGeometry())).toBe(sky);
  });
  it('blend a mesh with a vertex below full alpha, the haze and the shadow, and leave the lit material as it is', () => {
    const haze = terraceMaterial(lamp(), colours([1, 0.2]));
    expect([haze.transparent, haze.name]).toEqual([true, 'terrace_blended']);
    expect(terraceMaterial(lamp(), colours([0, 0]))).toBe(haze);
    const lit = new THREE.MeshStandardMaterial();
    expect(terraceMaterial(lit, colours([0]))).toBe(lit);
  });
});

describe('the terrace camera and its sky', () => {
  const reset = { azimuth: 0, polar: 0.6288, distance: 13.6 };
  it('replaces the default view only', () => {
    expect(isDefaultView({ ...reset }, reset)).toBe(true);
    expect(isDefaultView({ ...reset, azimuth: 0.1 }, reset)).toBe(false);
    expect(isDefaultView({ ...reset, polar: 0.7 }, reset)).toBe(false);
    expect(isDefaultView({ ...reset, distance: 9 }, reset)).toBe(false);
    expect([TERRACE_VIEW.distance, Math.round((TERRACE_VIEW.polar * 180) / Math.PI)]).toEqual([13.6, 33]);
  });
  it('builds the marbles' + "'" + ' environment: a sky ramp, a bright window and a cyan strip, no sun disc', () => {
    const env = terraceEnvironment();
    expect(env.children).toHaveLength(3);
    const ramp = env.children[0] as THREE.Mesh;
    const colour = ramp.geometry.attributes.color!;
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < colour.count; i++) {
      const y = ramp.geometry.attributes.position!.getY(i);
      if (y > 49) top = colour.getZ(i);
      if (y < -49) bottom = colour.getZ(i);
    }
    expect(top).toBeGreaterThan(bottom); // teal blue at the zenith, brown ground below
    const window = env.children[1] as THREE.Mesh;
    expect((window.material as THREE.MeshBasicMaterial).color.r).toBeGreaterThan(1); // brighter than white: a window of light
  });
  it('saturates colours away from their grey and leaves the grey alone', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.8, 0.4, 0.2, 0.5, 0.5, 0.5]), 3));
    saturateColours(g, 1.5);
    const c = g.attributes.color!;
    expect(c.getX(0) - c.getZ(0)).toBeGreaterThan(0.6); // 0.6 before
    expect([c.getX(1), c.getY(1), c.getZ(1)].every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    saturateColours(g, 5); // never below zero
    expect(c.getZ(0)).toBeGreaterThanOrEqual(0);
  });
  it('tints the lit material once when merged, and saturates the dome', () => {
    const lit = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const dome = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit), { name: 'scene_sky_dome' });
    dome.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.3), 3));
    const root = new THREE.Group();
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ emissive: 0xffffff }));
    lamp.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 4).fill(1), 4));
    root.add(dome, lamp);
    const solid = (mergeByMaterial(root).children as THREE.Mesh[]).find((m) => (m.material as THREE.Material).name === 'terrace_solid')!;
    expect((solid.material as THREE.MeshBasicMaterial).color.g).toBeCloseTo(1 / TERRACE_EXPOSURE); // the unlit colour is not tinted
    expect(lit.color.g).toBeCloseTo(TERRACE_TINT.g);
  });
});
