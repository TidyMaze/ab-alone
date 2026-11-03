import './test/openworldwasm';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { CHUNK, World } from './openworld';
import { BLEND_MS, WORLD_LOOKS } from './daynight';
import { setNeonWorldOn } from './neonlook';
import { OpenWorldView } from './openworldview';
import { stripedMaterial, stripeFadeNode } from './openworldstripe';
import { sunPosition } from './tablezero';

// The sky of the Open world follows the time of day (docs/specs/openworld.md section 11, #1496).
const MIN = 60_000;
function flat(cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([i % 4, i % 8, 0], i * 3);
  return out;
}
const made = (): OpenWorldView => {
  const view = new OpenWorldView(new World(flat));
  view.show([0, 0]);
  return view;
};
const lights = (view: OpenWorldView): { sun: THREE.DirectionalLight; hemisphere: THREE.HemisphereLight } => {
  let sun!: THREE.DirectionalLight;
  let hemisphere!: THREE.HemisphereLight;
  view.scene.traverse((o) => {
    if ((o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
    if ((o as THREE.HemisphereLight).isHemisphereLight) hemisphere = o as THREE.HemisphereLight;
  });
  return { sun, hemisphere };
};

afterEach(() => setNeonWorldOn(false));

describe('the sky of the Open world view', () => {
  it('starts on the look of day: its sky for the background and the fog, the arena sun, the hemisphere', () => {
    const view = made();
    const { sun, hemisphere } = lights(view);
    const day = WORLD_LOOKS.day;
    expect((view.scene.background as THREE.Color).getHex()).toBe(day.sky);
    expect(view.scene.fog!.color.getHex()).toBe(day.sky);
    expect([sun.color.getHex(), sun.intensity]).toEqual([day.sun, day.sunIntensity]);
    expect([hemisphere.color.getHex(), hemisphere.groundColor.getHex(), hemisphere.intensity]).toEqual([day.hemiSky, day.hemiGround, day.hemiIntensity]);
    expect(sun.position.clone().sub(view.focusPoint).toArray().map((v) => +v.toFixed(3))).toEqual(sunPosition(30, day.elevation, day.azimuth).map((v) => +v.toFixed(3)));
  });

  it('turns to the night: the sky, the moonlight, the ambient, the water tint, and draws again once', () => {
    const view = made();
    const { sun, hemisphere } = lights(view);
    expect(view.setTime(9 * MIN, true)).toBe(true);
    const night = WORLD_LOOKS.night;
    expect((view.scene.background as THREE.Color).getHex()).toBe(night.sky);
    expect(view.scene.fog!.color.getHex()).toBe(night.sky);
    expect([sun.color.getHex(), sun.intensity]).toEqual([night.sun, night.sunIntensity]);
    expect([hemisphere.color.getHex(), hemisphere.groundColor.getHex(), hemisphere.intensity]).toEqual([night.hemiSky, night.hemiGround, night.hemiIntensity]);
    const water = view.scene.getObjectByName('terrain-water') as THREE.InstancedMesh;
    expect((water.material as THREE.MeshStandardMaterial).color.getHex()).toBe(night.water);
    const flatWater = view.scene.getObjectByName('terrain-water-flat') as THREE.InstancedMesh;
    expect((flatWater.material as THREE.MeshStandardMaterial).color.getHex()).toBe(night.water);
    expect(view.setTime(9.5 * MIN, true)).toBe(false); // the same look: nothing to draw
  });

  it('puts the sun where the look says, and keeps it there as the hero moves', () => {
    const view = made();
    const { sun } = lights(view);
    view.setTime(9 * MIN, true);
    view.show([2, 1]);
    const night = WORLD_LOOKS.night;
    expect(sun.position.clone().sub(view.focusPoint).toArray().map((v) => +v.toFixed(3))).toEqual(sunPosition(30, night.elevation, night.azimuth).map((v) => +v.toFixed(3)));
  });

  it('blends between two phases, and not under reduced motion', () => {
    const view = made();
    view.setTime(6 * MIN - BLEND_MS / 2, true);
    const mid = (view.scene.background as THREE.Color).getHex();
    expect(mid).not.toBe(WORLD_LOOKS.day.sky);
    expect(mid).not.toBe(WORLD_LOOKS.dusk.sky);
    view.setTime(6 * MIN - BLEND_MS / 2, false);
    expect((view.scene.background as THREE.Color).getHex()).toBe(WORLD_LOOKS.day.sky);
  });

  it('keeps the hero, the troop, the teleporters and the lairs lit at night: the glow follows the look', () => {
    const view = made();
    view.setTeleporters([[1, 1]]);
    const glow = (name: string): number => ((view.scene.getObjectByName(name) as THREE.InstancedMesh).material as THREE.MeshStandardMaterial).emissiveIntensity;
    const day = glow('teleporter-pad');
    view.setTime(9 * MIN, true);
    expect(glow('teleporter-pad')).toBeGreaterThan(day);
    expect(glow('teleporter-ring')).toBeGreaterThan(day);
    expect(view.shine.value).toBe(1);
    view.setTime(MIN, true);
    expect(glow('teleporter-pad')).toBe(day);
    expect(view.shine.value).toBe(0);
  });

  it('leaves the neon look alone: its black sky and cold sun stay whatever the time', () => {
    setNeonWorldOn(true);
    const view = made();
    const before = (view.scene.background as THREE.Color).getHex();
    expect(view.setTime(9 * MIN, true)).toBe(false);
    expect((view.scene.background as THREE.Color).getHex()).toBe(before);
  });
});

describe('the glow of a marble (#1496)', () => {
  it('a striped marble with a glow emits its colour in proportion to it, none without', () => {
    const look = { base: 0xcfe8ff, stripe: 0x6fa8dc, roughness: 0.1 };
    const fade = stripeFadeNode();
    expect(stripedMaterial(look, fade).emissiveNode).toBeNull();
    const view = made();
    expect(stripedMaterial(look, fade, undefined, view.shine).emissiveNode).not.toBeNull();
  });
});
