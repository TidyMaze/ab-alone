import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SUN, addSun, sunPosition, tableZeroActive } from './tablezero';

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
  it('puts the sun at elevation 22, 25 degrees left of the camera axis', () => {
    const [x, y, z] = sunPosition(10);
    expect(Math.asin(y / 10) * (180 / Math.PI)).toBeCloseTo(22);
    expect(x).toBeLessThan(0);
    expect(Math.atan2(-x, z) * (180 / Math.PI)).toBeCloseTo(25);
    expect(Math.hypot(x, y, z)).toBeCloseTo(10);
    expect(sunPosition()).toHaveLength(3);
  });
  it('keeps the palette of the direction', () => {
    expect([PALETTE.dish, PALETTE.gap, PALETTE.whiteClamp]).toEqual([0xb4aa81, 0x2c3438, 0xe8e4d6]);
  });
});
