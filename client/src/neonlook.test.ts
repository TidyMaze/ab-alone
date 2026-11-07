import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NEON, NEON_CELL_SCALE, NEON_HIDDEN, NEON_LIGHT, lightNeon, targetArrowMaterial, neonEdgeGeometry, neonGlow, neonEdgeMaterial, neonLookOn, neonMaterial, neonPaint, neonPedestal, neonStars, NEON_TELL, nextToSight, neonBreachGeometry, neonEggGeometry, neonVoidGeometry, neonVoidMaterial, neonCrackMap, neonFogGeometry, neonTells, neonVeil, tellLook, NEON_RIM, NEON_GLOSS, NEON_WHITE_RIM, neonMarbleRim } from './neonlook';
import { mergeByMaterial } from './tablezero';
import { scalePower } from './lightpanel';
import { DECK_NAMES } from './deck';
import { DECK_KEY, NEON_GLOW, NEON_WORLD_LOOKS, neonDeckLook, neonSkyOf } from './neonlook';

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
  it('draws the target arrow near-black under the neon look; the terrace keeps the kit arrow (#1508)', () => {
    const kit = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const arrow = targetArrowMaterial(true, kit) as THREE.MeshBasicMaterial;
    expect(arrow).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(arrow.color.getHex()).toBe(NEON.arrow);
    expect(targetArrowMaterial(false, kit)).toBe(kit);
  });

  it('is the default look: on with no look or ?look=neon, off for ?look=terrace and the board looks (#1424)', () => {
    for (const s of ['', '?bot=off', '?look=neon']) expect(neonLookOn(s)).toBe(true);
    for (const s of ['?look=terrace', '?bot=off&look=terrace', '?look=tonal', '?look=pbr', '?look=']) expect(neonLookOn(s)).toBe(false);
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

  it('draws the rim on the black shell under the neon look only, the white side too, softer (#1552, #1553)', () => {
    // The rim is a node (the renderer is WebGPU, its WebGL 2 fallback too: onBeforeCompile is not run there, #1552).
    const shell = (): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({ color: NEON.blackMarble });
    const glass = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: NEON.whiteMarble, roughness: 0.6 });
    const emissive = (material: THREE.Material): unknown => (material as THREE.Material & { emissiveNode?: { isNode?: boolean } }).emissiveNode;
    expect((emissive(neonMarbleRim('black', shell(), true)) as { isNode: boolean }).isNode).toBe(true);
    expect((emissive(neonMarbleRim('white', glass(), true)) as { isNode: boolean }).isNode).toBe(true);
    expect(emissive(neonMarbleRim('black', shell(), false))).toBeUndefined();
    expect(emissive(neonMarbleRim('white', glass(), false))).toBeUndefined();
    expect((emissive(neonMarbleRim('black', new THREE.MeshBasicMaterial(), true)) as { isNode: boolean }).isNode).toBe(true); // no emissive of its own: black
    expect(NEON_WHITE_RIM.strength).toBeLessThan(NEON_RIM.strength);
    expect(NEON_WHITE_RIM.colour).not.toBe(NEON_RIM.colour);
  });

  it('gives both marble colours a sharper sun highlight under the neon look, none under the terrace (#1553)', () => {
    // The terrace's own numbers (terraceShell 0.3 and 0.12, terraceGlass 0.6): the look only changes them when it is on.
    const shell = (): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({ color: NEON.blackMarble, roughness: 0.3, specularIntensity: 0.12 });
    const glass = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: NEON.whiteMarble, roughness: 0.6 });
    const on = neonMarbleRim('black', shell(), true) as THREE.MeshPhysicalMaterial;
    expect(on.specularIntensity, 'black highlight').toBe(NEON_GLOSS.specularIntensity);
    expect(on.specularIntensity, 'black highlight above the terrace').toBeGreaterThan(0.12);
    expect(on.roughness, 'black roughness').toBe(NEON_GLOSS.roughness.black);
    const white = neonMarbleRim('white', glass(), true) as THREE.MeshStandardMaterial;
    expect(white.roughness, 'white highlight').toBe(NEON_GLOSS.roughness.white);
    expect(white.roughness, 'white roughness below the terrace').toBeLessThan(0.6);
    expect(white.roughness, 'white keeps its shading, not a mirror').toBeGreaterThanOrEqual(0.35);
    const off = neonMarbleRim('black', shell(), false) as THREE.MeshPhysicalMaterial;
    expect(off.specularIntensity, 'terrace black unchanged').toBe(0.12);
    expect(off.roughness, 'terrace black roughness unchanged').toBe(0.3);
    const offWhite = neonMarbleRim('white', glass(), false) as THREE.MeshStandardMaterial;
    expect(offWhite.roughness, 'terrace white unchanged').toBe(0.6);
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
    expect(neonMaterial('scene_slab_arena')).not.toBe(slate); // the slab has its own material, tinted per deck (#1551)
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
    expect(stars.name).toBe('starfield');
    const scene = new THREE.Scene(); // its name holds no 'neon': the light sliders scale the meshes called so, and the stars have no emissive power
    scene.add(stars);
    expect(() => scalePower(scene, { bloom: 100, lamps: 100, lights: 100 })).not.toThrow();
    expect(stars.geometry.attributes.position!.count).toBe(150);
    for (let i = 0; i < 150; i += 3) expect(stars.geometry.attributes.position!.getY(i)).toBeGreaterThan(0);
  });

  it('draws a cyan hexagon in the gap of each cell, brighter than the cell', () => {
    expect(neonEdgeGeometry().attributes.position!.count).toBe(36);
    expect(neonEdgeMaterial().color.b).toBeGreaterThan(1);
  });

  it('copies the pedestal in slate with a thin cyan ring, and leaves the file mesh as it was', () => {
    const geometry = painted(0xd8d4c8, 0xd8d4c8, 0xd8d4c8);
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2)); // dropped
    const file = Object.assign(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()), { name: 'kit_pedestal_flat' });
    const copy = neonPedestal(file);
    expect(at(copy.geometry, 0).getHex()).toBe(NEON.plateau);
    const colours = copy.geometry.attributes.color!;
    expect(colours.count).toBeGreaterThan(3); // the disc and its ring
    expect(at(copy.geometry, colours.count - 1).b).toBeGreaterThan(at(copy.geometry, 0).b); // the ring is bluer than the slate
    expect(copy.geometry.attributes.uv).toBeUndefined();
    expect(at(file.geometry, 0).getHex()).toBe(0xd8d4c8);
    expect(copy.material).toBe(neonMaterial('slate'));
  });

  it('glows: a violet channel on the rim and a band and a tip on each post, unlit above 1', () => {
    const glow = neonGlow([new THREE.Vector3(1, 0, 2), new THREE.Vector3(-1, 0, 2)], true);
    expect(glow.children).toHaveLength(5);
    expect(Math.max(...((glow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.toArray())).toBeGreaterThan(1);
    expect(glow.children[1]!.position.toArray()).toEqual([1, 0.7, 2]);
    expect(neonGlow([], false).children).toHaveLength(0);
  });

  it('gives each deck its own key colour, from the palette, and its own slab tint (#1551)', () => {
    const keys = DECK_NAMES.map((d) => DECK_KEY[d].key);
    expect(new Set(keys).size).toBe(DECK_NAMES.length);
    const tints = DECK_NAMES.map((d) => {
      neonDeckLook(d);
      return (neonMaterial('scene_slab_arena') as THREE.MeshStandardMaterial).color.toArray().join(); // not a hex: the tint is a multiplier of the rim, above 1
    });
    expect(new Set(tints).size).toBe(DECK_NAMES.length);
    const grounds = DECK_NAMES.map((d) => {
      neonDeckLook(d);
      return (neonMaterial('scene_col_map_b') as THREE.MeshStandardMaterial).color.toArray().join();
    });
    expect(new Set(grounds).size).toBe(DECK_NAMES.length); // the ground outside the board too (#1551)
    expect(new Set(DECK_NAMES.map((d) => neonSkyOf(d).getHexString())).size).toBe(DECK_NAMES.length); // the sky too (#1551)
    neonDeckLook('mess');
  });

  it('glows the rim in the deck key and the posts in its accent, the brightest channel at NEON_GLOW (#1551)', () => {
    neonDeckLook('cargo');
    const glow = neonGlow([new THREE.Vector3(1, 0, 2)], true);
    const [rim, post] = [glow.children[0], glow.children[1]].map((m) => (m as THREE.Mesh).material as THREE.MeshBasicMaterial);
    expect(Math.max(...rim!.color.toArray())).toBeCloseTo(NEON_GLOW);
    expect(rim!.color.getHex()).toBe(new THREE.Color(DECK_KEY.cargo.key).multiplyScalar(NEON_GLOW / Math.max(...new THREE.Color(DECK_KEY.cargo.key).toArray())).getHex());
    expect(post!.color.getHex()).toBe(new THREE.Color(DECK_KEY.cargo.accent).multiplyScalar(NEON_GLOW / Math.max(...new THREE.Color(DECK_KEY.cargo.accent).toArray())).getHex());
    neonDeckLook('mess');
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
    root.add(piece('scene_cell_00'), piece('scene_cell_01', 2), piece('scene_sky_dome'), piece('scene_slab_arena'), piece('scene_turnbar_black'), piece('scene_post_0', 5));
    const out = mergeByMaterial(root, false, true);
    const dishes = out.getObjectByName('terrace_dishes') as THREE.InstancedMesh;
    const edges = out.getObjectByName('terrace_edges') as THREE.InstancedMesh;
    expect(dishes.material).toBe(neonMaterial('dish'));
    expect(at(dishes.geometry, 0).getHex()).toBe(NEON.cell);
    expect([dishes.count, edges.count]).toEqual([2, 2]);
    const first = new THREE.Matrix4();
    dishes.getMatrixAt(0, first);
    expect(new THREE.Vector3().setFromMatrixScale(first).x).toBeCloseTo(NEON_CELL_SCALE); // the gap is 40 % wider
    expect(new THREE.Vector3().setFromMatrixPosition(first).x).toBe(0); // about its own centre
    expect(NEON_CELL_SCALE).toBeCloseTo(0.938, 3);
    dishes.userData.show((x: number) => x === 2);
    expect([dishes.count, edges.count]).toEqual([1, 1]); // a vanished cell loses its edge too
    expect((out.getObjectByName('terrace_voids') as THREE.InstancedMesh).count).toBe(1); // and wears a pale outline
    const bar = out.children.find((c) => c.name === 'scene_turnbar_black') as THREE.Mesh;
    expect(bar.material).toBe(neonMaterial('scene_turnbar_black'));
    expect(out.getObjectByName('neon_glow')!.children).toHaveLength(3); // the rim channel, a band and a tip
    expect(out.getObjectByName('neon_glow')!.parent).toBe(out); // not split: the board is the file itself
    // the sky mesh is not merged: the slab (lit, its own tint per deck) and the posts' slate are
    expect((out.children as THREE.Mesh[]).filter((m) => m.isMesh && m.name === '').length).toBe(2);
  });
  it('leaves the dish alone without the look', () => {
    const root = new THREE.Group();
    root.add(piece('scene_cell_00'));
    const out = mergeByMaterial(root);
    expect(out.getObjectByName('terrace_edges')!.visible).toBe(false); // a hidden glow under the dishes, for the lair fight at night (#1496)
  });
});

describe('the tells of the neon look (#1424)', () => {
  it("is the game's own sizes without the look, thick and lifted with it", () => {
    expect(tellLook(false)).toEqual({ ringTube: 0.025, glyph: 1, chevron: 1, plate: 1, plateLift: 0, fogRings: 1, shockInner: 0.96, ringSides: 32, ringRadius: 0.42, arenaDecal: 1, egg: 1, lift: 0, arenaLift: 0, glowFloor: 0, breachTint: 0, breachMix: 0, breachOpacity: 0.55 });
    expect(tellLook(true)).toBe(NEON_TELL);
    expect(NEON_TELL.ringTube).toBeGreaterThan(0.025 * 2); // a thin line is mostly anti-aliased pixels
    expect(NEON_TELL.lift).toBeGreaterThan(0.1 - 0.05); // the shock ring (0.05) clears the dish tops (0.1)
    expect(NEON_TELL.arenaLift * 0.5).toBeGreaterThan(0.1); // the arena is drawn at half size
    expect(NEON_TELL.glowFloor).toBe(1); // the glow under an egg on 1 is steady, never a flicker
  });
  it('draws the crack as a thick mask: lines from the middle, none in the corners', () => {
    const map = neonCrackMap(64);
    const data = map.image.data as Uint8Array;
    const at = (x: number, y: number): number => data[(y * 64 + x) * 4 + 1]!;
    expect(at(32, 32)).toBe(255); // the middle, where every crack meets
    expect(at(0, 0)).toBe(0);
    expect(at(63, 63)).toBe(0);
    let lit = 0;
    for (let i = 0; i < 64 * 64; i++) if (data[i * 4 + 1] === 255) lit++;
    expect(lit / (64 * 64)).toBeGreaterThan(0.2); // thick: more than a hairline
    expect(lit / (64 * 64)).toBeLessThan(0.7);
    expect(map.wrapS).toBe(THREE.ClampToEdgeWrapping);
  });
  it('dresses the materials of the tells', () => {
    const m = {
      crack: new THREE.MeshBasicMaterial({ color: 0x777777 }),
      egg: new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: 0.55 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x777777 }),
      chevron: new THREE.MeshBasicMaterial({ color: 0xf0a830 }),
      arrival: new THREE.MeshBasicMaterial({ color: 0xff7a3d }),
      pale: new THREE.MeshBasicMaterial({ color: 0xd8d4c8 }),
    };
    neonTells(m);
    expect(m.crack.color.getHex()).toBe(NEON_TELL.sodium);
    expect(m.crack.alphaMap).toBeInstanceOf(THREE.DataTexture);
    expect(m.egg.map).toBeNull(); // no speckled shell: a near-black egg
    expect(m.egg.color.getHex()).toBe(0xffffff);
    expect(m.egg.vertexColors).toBe(true);
    expect(m.egg.emissive.getHex()).toBe(NEON_TELL.ink);
    expect(m.egg.roughness).toBe(1);
    for (const sodium of [m.glow, m.chevron, m.arrival]) expect(sodium.color.getHex()).toBe(NEON_TELL.sodium);
    for (const material of Object.values(m)) expect(material.toneMapped).toBe(false); // the colour on the screen is the colour chosen
  });
  it('wears the fog as a near-opaque dark hexagon in a cyan outline, one geometry', () => {
    const geometry = neonFogGeometry();
    const colour = geometry.attributes.color!;
    const hexes = new Set(Array.from({ length: colour.count }, (_, i) => new THREE.Color(colour.getX(i), colour.getY(i), colour.getZ(i)).getHex()));
    expect([...hexes].sort()).toEqual([NEON_TELL.outline, NEON_TELL.ink].sort()); // the disc and its outline
    const material = new THREE.MeshBasicMaterial({ opacity: 0.9, transparent: true });
    const veil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.46), material, 2);
    neonVeil(material, veil);
    expect(veil.geometry.attributes.color).toBeDefined();
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(NEON_TELL.fog);
    expect(material.toneMapped).toBe(false);
  });
  it('gives the egg a bone collar on a near-black ovoid, the breach a hexagon wider than a cell, the void a pale outline', () => {
    const egg = neonEggGeometry();
    const colour = egg.attributes.color!;
    const hexes = new Set(Array.from({ length: colour.count }, (_, i) => new THREE.Color(colour.getX(i), colour.getY(i), colour.getZ(i)).getHex()));
    expect([...hexes].sort()).toEqual([0xffffff, NEON_TELL.ink].sort());
    const breach = neonBreachGeometry();
    breach.computeBoundingBox();
    expect(breach.boundingBox!.max.z).toBeGreaterThan(0.5); // past the cell's own edge: the cells join
    expect(neonVoidGeometry().attributes.position!.count).toBe(36);
    expect(neonVoidMaterial().color.getHex()).toBe(0xe6ffff);
    const seen = (q: number, r: number): boolean => q === 0 && r === 0;
    expect(nextToSight(1, 0, seen)).toBe(1); // a cell touching the sight is on its edge
    expect(nextToSight(2, 0, seen)).toBe(0); // one deeper in the fog is not
    expect(NEON_TELL.fogRings).toBe(0);
  });
});

describe('the Open world under the neon look: day, dusk and night (#1536)', () => {
  it('its day is the look the neon look ships: the black sky, the cold sun, the violet-white hemisphere, no glow', () => {
    const day = NEON_WORLD_LOOKS.day;
    expect([day.sky, day.sun, day.sunIntensity, day.elevation, day.azimuth]).toEqual([NEON.sky, NEON_LIGHT.sun, NEON_LIGHT.sunIntensity, NEON_LIGHT.elevation, NEON_LIGHT.azimuth]);
    expect([day.hemiSky, day.hemiGround, day.hemiIntensity, day.glow]).toEqual([NEON_LIGHT.skyMix, NEON_LIGHT.ground, NEON_LIGHT.hemisphere, 0]);
  });

  it('dusk takes the violet sky and violet light, and night the pedestal ring moon, in readable light', () => {
    const { day, dusk, night } = NEON_WORLD_LOOKS;
    expect(dusk.sky).not.toBe(day.sky);
    expect(dusk.sun).toBe(NEON_LIGHT.sun);
    expect(night.sky).toBe(NEON.sky);
    expect(night.sun).toBe(NEON.pedestalRing);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(night.hemiIntensity).toBeGreaterThanOrEqual(1);
    expect([dusk.glow, night.glow]).toEqual([0.4, 1]);
  });
});
