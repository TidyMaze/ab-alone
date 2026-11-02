import './test/openworldwasm';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { NEON, neonSunPosition, neonWorldOn } from './neonlook';
import { WORLD, WORLD_EDGE_GAIN, WORLD_SHADOW, applyNeonWorld, mapColour, neonProp, neonTraces } from './neonworld';
import { AMBIENT } from './openworldparticles';
import { CHUNK, World } from './openworld';
import { terrainColour } from './openworldminimap';
import { BIOME_LOOK, LAIR_LOOK, LOOK, MARBLE_LOOK, OpenWorldView, PROPS, TELEPORTER_LOOK, WATER } from './openworldview';

const palette = { LOOK, WATER, BIOME_LOOK, PROPS, MARBLE_LOOK, LAIR_LOOK, TELEPORTER_LOOK, AMBIENT };
const bytes = (): Uint8Array => {
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 0], i * 3);
  return out;
};
const lum = (n: number): number => {
  const c = new THREE.Color(n);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const painted = (...hexes: number[]): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hexes.length * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(hexes.flatMap((h) => new THREE.Color(h).toArray())), 3));
  return g;
};
const colourAt = (g: THREE.BufferGeometry, i: number): THREE.Color => new THREE.Color().fromBufferAttribute(g.attributes.color!, i);

afterEach(() => applyNeonWorld(false, palette));

describe('the neon palette of the Open world (#1424)', () => {
  it('puts the three ground tones on the biomes, and gives the game its own back', () => {
    const [grass, sand, mountain] = [LOOK.grass.color, LOOK.sand.color, PROPS.mountain.color];
    const geometry = PROPS.tree.geometry;
    applyNeonWorld(true, palette);
    expect(neonWorldOn()).toBe(true);
    expect([LOOK.grass.color, LOOK.sand.color, LOOK.rock.color, LOOK.peak.color]).toEqual([WORLD.meadow, WORLD.mesa, WORLD.rock, WORLD.rock]);
    expect([BIOME_LOOK.meadow.ground, BIOME_LOOK.forest.ground, BIOME_LOOK.desert.ground, BIOME_LOOK.badlands.ground, BIOME_LOOK.archipelago.ground]).toEqual([WORLD.meadow, WORLD.meadow, WORLD.mesa, WORLD.mesa, WORLD.meadow]);
    expect(Object.values(BIOME_LOOK).every((b) => b.prop === 0xffffff)).toBe(true);
    expect([LAIR_LOOK.open, LAIR_LOOK.beaten]).toEqual([NEON.violet, NEON.cyan]);
    expect(PROPS.boulder.color).toBe(WORLD.boulder);
    expect(PROPS.tree.geometry).toBe(geometry); // only colours are touched
    expect(Object.values(AMBIENT).every((a) => a!.colour === 0x2b3648)).toBe(true);
    applyNeonWorld(false, palette);
    expect(neonWorldOn()).toBe(false);
    expect([LOOK.grass.color, LOOK.sand.color, PROPS.mountain.color]).toEqual([grass, sand, mountain]);
    applyNeonWorld(false, palette); // nothing to give back: still the game's
    expect(LOOK.grass.color).toBe(grass);
  });

  it('keeps the hero and the troop the brightest things, 3:1 over the meadow', () => {
    applyNeonWorld(true, palette);
    const meadow = lum(WORLD.meadow);
    for (const marble of [MARBLE_LOOK.hero.base, MARBLE_LOOK.troop.base]) expect((lum(marble) + 0.05) / (meadow + 0.05)).toBeGreaterThan(3);
    for (const other of [WORLD.meadow, WORLD.mesa, NEON.crystal, TELEPORTER_LOOK.colour, LAIR_LOOK.open, LAIR_LOOK.beaten, PROPS.cap.color]) expect(lum(other)).toBeLessThan(lum(MARBLE_LOOK.troop.base));
  });

  it('lifts the map colours so the darkest terrain stays 3:1 over the map back, and only with the look', () => {
    const rock = terrainColour('rock');
    expect(rock).toBe(`#${LOOK.rock.color.toString(16).padStart(6, '0')}`);
    applyNeonWorld(true, palette);
    const lifted = terrainColour('rock');
    expect(lifted).not.toBe(rock);
    expect((lum(parseInt(lifted.slice(1), 16)) + 0.05) / (lum(0x0b0d0f) + 0.05)).toBeGreaterThan(3);
    expect(mapColour(0xffffff)).toBe(0xffffff);
  });

  it('paints the models: slate mountains, calm crystals, a wall that keeps its sodium seam, a lair lamp violet then cyan', () => {
    const mountain = neonProp('mountain', painted(0x4d5566, 0xe6f0ff));
    expect(colourAt(mountain, 0).getHex()).toBe(0x1b2233);
    expect(colourAt(mountain, 1).getHex()).toBe(0x3a4560);
    expect(colourAt(neonProp('tree', painted(0x1c2a1c, 0x70e0c8)), 1).getHex()).toBe(NEON.crystal);
    const wall = neonProp('wall', painted(0x16160d, 0xd9803b));
    expect(colourAt(wall, 1).getHex()).toBe(0xd9803b);
    expect(colourAt(wall, 0).getHex()).toBe(0x0f1320);
    const open = neonProp('lair', painted(0x2a2e0d, 0xff9e7a));
    expect(colourAt(open, 1).b).toBeGreaterThan(colourAt(open, 1).g);
    const beaten = neonProp('lair_beaten', painted(0x2a2e38, 0x66c77a));
    expect(colourAt(beaten, 1).g).toBeGreaterThan(colourAt(beaten, 1).r);
    expect(colourAt(neonProp('mountain', painted(0x808080, 0x808080)), 0).getHex()).toBe(0x3a4560); // a model of one colour
    const plain = new THREE.BoxGeometry();
    expect(neonProp('mountain', plain)).toBe(plain); // no vertex colours, nothing to paint
  });
});

describe('the Open world view with the look (#1424)', () => {
  it('has a black sky with stars that follow the camera, the cold sun, 55 % shadows and its models painted', () => {
    applyNeonWorld(true, palette);
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    expect((view.scene.background as THREE.Color).getHex()).toBe(NEON.sky);
    expect((view.scene.fog as THREE.Fog).color.getHex()).toBe(NEON.sky);
    const stars = view.scene.getObjectByName('neon_stars')!;
    expect(stars.position.toArray()).toEqual(view.camera.position.toArray());
    expect(stars.position.length()).toBeGreaterThan(0);
    let sun!: THREE.DirectionalLight;
    view.scene.traverse((o) => void ((o as THREE.DirectionalLight).isDirectionalLight && (sun = o as THREE.DirectionalLight)));
    expect(sun.position.clone().sub(view.focusPoint).toArray().map((v) => +v.toFixed(3))).toEqual(neonSunPosition().map((v) => +v.toFixed(3)));
    view.setShadows(true);
    expect(sun.shadow.intensity).toBe(WORLD_SHADOW);
    view.setShadows(false);
    const mountain = painted(0x4d5566, 0xe6f0ff);
    view.useModels({ low: { mountain, lair: painted(0x2a2e0d, 0xff9e7a), lair_beaten: painted(0x2a2e38, 0x66c77a) }, high: { mountain } });
    const geometry = (view.scene.getObjectByName('prop-mountain') as THREE.InstancedMesh).geometry;
    expect(colourAt(geometry, 1).getHex()).toBe(0x3a4560);
    view.setLairs([[0, 0]], []);
    expect(view.scene.getObjectByName('lair-0')).toBeDefined();
  });

  it('is the game as it was without the look: no stars, the ship black, the arena sun', () => {
    const view = new OpenWorldView(new World(bytes));
    view.show([0, 0]);
    expect(view.scene.getObjectByName('neon_stars')).toBeUndefined();
    expect((view.scene.background as THREE.Color).getHex()).not.toBe(NEON.sky);
    let sun!: THREE.DirectionalLight;
    view.scene.traverse((o) => void ((o as THREE.DirectionalLight).isDirectionalLight && (sun = o as THREE.DirectionalLight)));
    view.setShadows(true);
    expect(sun.shadow.intensity).not.toBe(WORLD_SHADOW);
  });
});

describe('the circuit traces of the Open world ground (#1424)', () => {
  it('is a tile of thin lines, most of it dark, that repeats', () => {
    const tile = neonTraces(64);
    const data = tile.image.data as Uint8Array;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === 255) lit++;
    expect(lit).toBeGreaterThan(40);
    expect(lit / (64 * 64)).toBeLessThan(0.5);
    expect(tile.wrapS).toBe(THREE.RepeatWrapping);
    expect(neonTraces().image.width).toBe(512);
    expect(WORLD_EDGE_GAIN).toBeLessThan(-0.5); // a deep seam, the cyan line sits in it
  });
});
