import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SUN, addSun, mergeByMaterial, sunPosition, tableZeroActive, terraceMaterial, aimSunShadow, SUN_SHADOW, terraceEnvironment, saturateColours, isDefaultView, TERRACE_VIEW, TERRACE_EXPOSURE, TERRACE_TINT } from './tablezero';

describe('Table Zero is the scene of every mode', () => {
  const on = { room: false, ready: true };
  it('is on once the arena has loaded, or has failed to: the board then stands on a plain background', () => expect(tableZeroActive(on)).toBe(true));
  it('waits for the arena file', () => expect(tableZeroActive({ ...on, ready: false })).toBe(false));
  it('is off only when the automated tests ask for the room', () => expect(tableZeroActive({ ...on, room: true })).toBe(false));
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
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.8, 0.4, 0.2, 0.5, 0.5, 0.5]), 3));
    saturateColours(g, 1.5);
    const c = g.attributes.color!;
    expect(c.getX(0) - c.getZ(0)).toBeGreaterThan(0.6); // 0.6 before
    expect([c.getX(1), c.getY(1), c.getZ(1)].every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    saturateColours(g, 5); // never below zero
    expect(c.getZ(0)).toBeGreaterThanOrEqual(0);
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 30, 0]), 3));
    h.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.8, 0.4, 0.2, 0.8, 0.4, 0.2]), 3));
    saturateColours(h, 0.5, 20, Infinity);
    expect([h.attributes.color!.getX(0), h.attributes.color!.getX(1) < 0.8]).toEqual([0.800000011920929, true]); // only the vertex above 20 moved
  });
  it('tints the lit material once when merged, and saturates the dome', () => {
    const lit = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const dome = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit), { name: 'scene_sky_dome' });
    dome.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.3), 3));
    const slab = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit), { name: 'scene_slab_arena' });
    slab.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.3), 3));
    const root = new THREE.Group();
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ emissive: 0xffffff }));
    lamp.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 4).fill(1), 4));
    root.add(dome, slab, lamp);
    const solid = (mergeByMaterial(root).children as THREE.Mesh[]).find((m) => (m.material as THREE.Material).name === 'terrace_solid')!;
    expect((solid.material as THREE.MeshBasicMaterial).color.g).toBeCloseTo(1 / TERRACE_EXPOSURE); // the unlit colour is not tinted
    expect(lit.color.g).toBeCloseTo(TERRACE_TINT.g);
  });
});

describe('the sun soft shadow (#1364)', () => {
  it('aims the shadow camera over the board and its plinth, and switches off with the tier', () => {
    const sun = new THREE.DirectionalLight();
    aimSunShadow(sun, true);
    expect([sun.castShadow, sun.shadow.mapSize.x, sun.shadow.camera.right, sun.shadow.camera.left]).toEqual([true, SUN_SHADOW.size, SUN_SHADOW.extent, -SUN_SHADOW.extent]);
    expect([sun.shadow.bias, sun.shadow.intensity]).toEqual([SUN_SHADOW.bias, SUN_SHADOW.intensity]);
    aimSunShadow(sun, false);
    expect(sun.castShadow).toBe(false);
  });
  it('lets the lit board cast and receive, and not the unlit sky', () => {
    const lit = new THREE.MeshStandardMaterial();
    const lamp = new THREE.MeshStandardMaterial({ emissive: 0xffffff });
    const [a, b] = [new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lamp)];
    for (const m of [a, b]) m.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 4).fill(1), 4));
    const root = new THREE.Group();
    root.add(a, b);
    const [first, second] = mergeByMaterial(root).children as THREE.Mesh[];
    expect([first!.castShadow, first!.receiveShadow, second!.castShadow]).toEqual([true, true, false]);
  });
});

describe('the boss fights on the terrace (#1374)', () => {
  it('draws the dishes as one instanced mesh that drops the vanished cells', () => {
    const material = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position!.count * 3).fill(0.5), 3));
    for (const [i, x] of [0, 2, 4].entries()) {
      const cell = new THREE.Mesh(geometry, material);
      cell.name = `scene_cell_0${i}`;
      cell.position.set(x, 0, 1);
      root.add(cell);
    }
    const dishes = mergeByMaterial(root).getObjectByName('terrace_dishes') as THREE.InstancedMesh;
    expect(dishes.count).toBe(3);
    dishes.userData.show((x: number, z: number) => x !== 2 && z === 1);
    expect(dishes.count).toBe(2);
    const m = new THREE.Matrix4();
    dishes.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(4); // compacted: the third cell took the second place
    expect(mergeByMaterial(new THREE.Group()).getObjectByName('terrace_dishes')).toBeUndefined();
  });
  it('draws the slab, the plinth shadow, the posts and the dishes as a board of their own, for a bigger board to replace', () => {
    const material = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const piece = (name: string, x: number): THREE.Mesh => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position!.count * 3).fill(0.5), 3));
      const mesh = Object.assign(new THREE.Mesh(geometry, material), { name });
      mesh.position.x = x;
      return mesh;
    };
    root.add(piece('scene_slab_arena', 0), piece('scene_post_0', 1), piece('scene_cell_00', 2), piece('scene_tower_body_0', 3));
    const merged = mergeByMaterial(root, true);
    const board = merged.getObjectByName('terrace_board')!;
    expect(board.children.map((c) => c.name)).toEqual(['', 'terrace_dishes']); // the slab and posts as one mesh, then the dishes
    expect(merged.children).toHaveLength(2); // the rest of the scene, and the board
    expect((board.children[0] as THREE.Mesh).geometry.attributes.position!.count).toBe(48); // the slab and the post
    expect(material.color.r).toBeCloseTo(TERRACE_TINT.r); // tinted once, though it is in both groups
  });
});
