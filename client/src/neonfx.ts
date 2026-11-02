// Neon accent lights (#1424): 2 point lights in the room (hub, arena, dual share it) and 2 in the Open world, one cyan and one
// violet, with a slight pulse. They are made once and hidden, not removed, when the tier is low or the renderer draws in software.
import * as THREE from 'three';
import type { Tier } from './quality';

export const NEON_ROOM_POINT_LIGHTS = 2;
export const NEON_OPEN_WORLD_POINT_LIGHTS = 2;
/** The pulse's share of the light's power, either way. */
export const ACCENT_PULSE = 0.12;
const PERIOD_MS = 4000;

const SPEC = {
  room: [
    { colour: 0x19e6ff, power: 1.4, reach: 12, at: [-6, 4, 5] },
    { colour: 0x9a6bff, power: 1.4, reach: 12, at: [6, 4, -5] },
  ],
  openworld: [
    { colour: 0x19e6ff, power: 1.4, reach: 7, at: [-3, 2.5, 2] },
    { colour: 0x9a6bff, power: 1.4, reach: 7, at: [3, 2.5, -2] },
  ],
} as const;

export function accentLights(scene: keyof typeof SPEC): THREE.PointLight[] {
  return SPEC[scene].map(({ colour, power, reach, at }) => {
    const light = new THREE.PointLight(colour, power, reach);
    light.name = 'neon accent';
    light.visible = false; // shown by driveAccents on the high tier of a GPU only
    light.position.set(at[0], at[1], at[2]);
    return light;
  });
}

/** Whether the accent lights are drawn: the high tier of a renderer with a GPU. The low tier and software draw none. */
export const accentOn = (tier: Tier, software: boolean): boolean => tier === 'high' && !software;

/** The factor on the power at `now` (ms): 1 under reduced motion. */
export const accentPulse = (now: number, reduced: boolean): number => (reduced ? 1 : 1 + ACCENT_PULSE * Math.sin((2 * Math.PI * now) / PERIOD_MS));

/** Shows or hides the lights and sets the power of the frame; the base power is kept on the light so the pulse never compounds. */
export function driveAccents(lights: readonly THREE.PointLight[], on: boolean, now: number, reduced: boolean): void {
  for (const light of lights) {
    light.visible = on;
    if (!on) continue;
    const base = (light.userData.power ??= light.intensity) as number;
    light.intensity = base * accentPulse(now, reduced);
  }
}
