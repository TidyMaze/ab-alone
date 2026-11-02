import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NEON, NEON_HIDDEN, NEON_LIGHT, lightNeon, neonEdgeGeometry, neonEdgeMaterial, neonLookOn, neonMaterial, neonPaint, neonPedestal, neonStars } from './neonlook';
import { mergeByMaterial } from './tablezero';

const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** A geometry whose vertex colours go from `dark` to `light` (hex, as the file's linear values). */
const painted = (...hexes: number[]): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  const colours = hexes.flatMap((h) => new THREE.Color(h).toArray());
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hexes.length * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  return g;
};
const at = (g: THREE.BufferGeometry, i: number): THREE.Color => new THREE.Color().fromBufferAttribute(g.attributes.color!, i);

describe('the neon look (#1424)', () => {
  it('is on for ?look=neon only', () => {
    expect(neonLookOn('?look=neon')).toBe(true);
    for (const s of ['', '?look=tonal', '?look=', '?neon']) expect(neonLookOn(s)).toBe(false);
  });

  it('puts the brightest colour of a cell on the slate, and keeps its bevel darker', () => {
    const g = painted(0xb3a98a, 0x4f4b3b);
    neonPaint('scene_cell_07', g);
    expect(at(g, 0).getHex()).toBe(NEON.cell);
    expect(lum(at(g, 1))).toBeLessThan(lum(at(g, 0)));
  });

  it('ramps the slab from the gap to the rim, and clamps outside the file range', () => {
    const g = painted(0x2a3540, 0xa29e9a, 0xffffff, 0x000000);
    neonPaint('scene_slab_arena', g);
    expect([at(g, 0).getHex(), at(g, 1).getHex(), at(g, 2).getHex(), at(g, 3).getHex()]).toEqual([NEON.gapFloor, NEON.rim, NEON.rim, NEON.gapFloor]);
  });

  it('paints the ground, the lamps and the turn bar, and leaves an unknown node alone', () => {
    const ground = painted(0x818d8d);
    neonPaint('scene_col_map_b00', ground);
    expect(at(ground, 0).getHex()).toBe(NEON.ground);
    const lamp = painted(0x8e5e40);
    neonPaint('scene_tower_lamp_3', lamp);
    expect(at(lamp, 0).getHex()).toBe(NEON.violet);
    const bar = painted(0x6ab4c3);
    neonPaint('scene_turnbar_black', bar);
    expect(at(bar, 0).getHex()).toBe(NEON.turn);
    const other = painted(0x123456);
    neonPaint('something_else', other);
    expect(at(other, 0).getHex()).toBe(0x123456);
  });

  it('hides the sky of the file, fog and clouds', () => {
    for (const n of ['scene_sky_dome', 'scene_sky_cloud_01', 'scene_fogring_0', 'scene_fogline']) expect(NEON_HIDDEN.test(n)).toBe(true);
    expect(NEON_HIDDEN.test('scene_cell_00')).toBe(false);
  });

  it('shares one material per kind: glass, slate, lamp, bar', () => {
    const [glass, slate, lamp, bar] = ['dish', 'scene_post_1', 'scene_tower_lamp_0', 'scene_turnbar_white'].map(neonMaterial);
    expect(glass).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((glass as THREE.MeshStandardMaterial).roughness).toBeLessThan((slate as THREE.MeshStandardMaterial).roughness);
    expect(lamp).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(bar).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(neonMaterial('scene_cell_04')).toBe(glass);
    expect(neonMaterial('scene_slab_arena')).toBe(slate);
  });

  it('lights with a cold sun low on the left and a neutral cool hemisphere', () => {
    const [sun, hemi] = [new THREE.DirectionalLight(), new THREE.HemisphereLight()];
    lightNeon(sun, hemi);
    expect(sun.intensity).toBe(NEON_LIGHT.sunIntensity);
    expect(sun.position.x).toBeLessThan(0);
    expect(sun.position.y).toBeCloseTo(30 * Math.sin((NEON_LIGHT.elevation * Math.PI) / 180));
    expect(hemi.intensity).toBe(NEON_LIGHT.hemisphere);
    expect(hemi.color.b).toBeGreaterThanOrEqual(hemi.color.r);
  });

  it('draws fine stars above the horizon, one mesh', () => {
    const stars = neonStars(50);
    expect(stars.name).toBe('neon_stars');
    expect(stars.geometry.attributes.position!.count).toBe(150);
    for (let i = 0; i < 150; i += 3) expect(stars.geometry.attributes.position!.getY(i)).toBeGreaterThan(0);
  });

  it('draws a cyan hexagon in the gap of each cell, brighter than the cell', () => {
    expect(neonEdgeGeometry().attributes.position!.count).toBe(36);
    expect(neonEdgeMaterial().color.b).toBeGreaterThan(1);
  });

  it('copies the pedestal in slate and leaves the file mesh as it was', () => {
    const file = Object.assign(new THREE.Mesh(painted(0xd8d4c8, 0xd8d4c8), new THREE.MeshStandardMaterial()), { name: 'kit_pedestal_flat' });
    const copy = neonPedestal(file);
    expect(at(copy.geometry, 0).getHex()).toBe(NEON.plateau);
    expect(at(file.geometry, 0).getHex()).toBe(0xd8d4c8);
    expect(copy.material).toBe(neonMaterial('slate'));
  });
});

describe('the neon look of the terrace file (#1424)', () => {
  const piece = (name: string, x = 0, colours = [0xb3a98a, 0x4f4b3b]): THREE.Mesh => {
    const g = painted(...colours);
    const mesh = Object.assign(new THREE.Mesh(g, new THREE.MeshStandardMaterial()), { name });
    mesh.position.set(x, 0, 1);
    return mesh;
  };
  it('paints, hides the sky, gives the dishes their edges and the bars their own material', () => {
    const root = new THREE.Group();
    root.add(piece('scene_cell_00'), piece('scene_cell_01', 2), piece('scene_sky_dome'), piece('scene_slab_arena'), piece('scene_turnbar_black'));
    const out = mergeByMaterial(root, false, true);
    const dishes = out.getObjectByName('terrace_dishes') as THREE.InstancedMesh;
    const edges = out.getObjectByName('terrace_edges') as THREE.InstancedMesh;
    expect(dishes.material).toBe(neonMaterial('dish'));
    expect(at(dishes.geometry, 0).getHex()).toBe(NEON.cell);
    expect([dishes.count, edges.count]).toEqual([2, 2]);
    dishes.userData.show((x: number) => x === 2);
    expect([dishes.count, edges.count]).toEqual([1, 1]); // a vanished cell loses its edge too
    const bar = out.children.find((c) => c.name === 'scene_turnbar_black') as THREE.Mesh;
    expect(bar.material).toBe(neonMaterial('scene_turnbar_black'));
    expect(out.children.length).toBeGreaterThan(0);
    // the sky mesh is not merged: only the slab (lit) is
    expect((out.children as THREE.Mesh[]).filter((m) => m.geometry && m.isMesh && m.name === '').length).toBe(1);
  });
  it('leaves the dish alone without the look', () => {
    const root = new THREE.Group();
    root.add(piece('scene_cell_00'));
    const out = mergeByMaterial(root);
    expect(out.getObjectByName('terrace_edges')).toBeUndefined();
  });
});
