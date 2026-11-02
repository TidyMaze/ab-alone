import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ACCENT_PULSE, NEON_OPEN_WORLD_POINT_LIGHTS, NEON_ROOM_POINT_LIGHTS, accentLights, accentOn, accentPulse, driveAccents } from './neonfx';

describe('the neon accent lights (#1424)', () => {
  it('has 2 lights in the room and 2 in the Open world, on the high tier of a real GPU only', () => {
    expect(accentLights('room')).toHaveLength(NEON_ROOM_POINT_LIGHTS);
    expect(accentLights('openworld')).toHaveLength(NEON_OPEN_WORLD_POINT_LIGHTS);
    expect(NEON_ROOM_POINT_LIGHTS).toBeLessThanOrEqual(4);
    expect(NEON_OPEN_WORLD_POINT_LIGHTS).toBeLessThanOrEqual(4);
    expect(accentOn('high', false)).toBe(true);
    expect(accentOn('low', false)).toBe(false);
    expect(accentOn('high', true)).toBe(false);
  });
  it('names each light and gives one cyan and one violet', () => {
    const lights = accentLights('room');
    expect(lights.every((l) => l.name === 'neon accent')).toBe(true);
    expect(lights.every((l) => !l.visible)).toBe(true);
    expect(lights[0]!.color.getHex()).toBe(0x19e6ff);
    expect(lights[1]!.color.getHex()).toBe(0x9a6bff);
  });
  it('pulses by a few percent, and not at all under reduced motion', () => {
    expect(accentPulse(1234, true)).toBe(1);
    for (let t = 0; t < 10000; t += 137) expect(Math.abs(accentPulse(t, false) - 1)).toBeLessThanOrEqual(ACCENT_PULSE + 1e-9);
    expect(accentPulse(1000, false)).not.toBe(1);
  });
  it('drives the lights: hidden when off, power times the pulse when on, never compounding', () => {
    const lights = accentLights('room');
    const base = lights[0]!.intensity;
    driveAccents(lights, false, 1000, false);
    expect(lights.every((l) => !l.visible)).toBe(true);
    driveAccents(lights, true, 1000, false);
    driveAccents(lights, true, 1000, false);
    expect(lights[0]!.visible).toBe(true);
    expect(lights[0]!.intensity).toBeCloseTo(base * accentPulse(1000, false));
    driveAccents(lights, true, 1000, true);
    expect(lights[0]!.intensity).toBeCloseTo(base);
    expect(lights[0]).toBeInstanceOf(THREE.PointLight);
  });
});
