// The day/night cycle of the Open world (docs/specs/openworld.md section 11, #1496). Data and arithmetic only: the view applies the
// look (openworldview.ts `setTime`), the mode counts the time (openworldmode.ts) and the lair fights read the phase (boardlook.ts).
import { SUN } from './tablezero';

export type Phase = 'day' | 'dusk' | 'night';

/** How long each phase lasts, in ms of play in the world. */
export const PHASE_MS: Readonly<Record<Phase, number>> = { day: 360_000, dusk: 90_000, night: 180_000 };

/** The phases round one cycle: day, dusk, night, then dusk again (the dawn uses the dusk look). */
const ROUND: readonly Phase[] = ['day', 'dusk', 'night', 'dusk'];
export const CYCLE_MS = ROUND.reduce((sum, phase) => sum + PHASE_MS[phase], 0);
/** The end of each phase is a blend into the next one's look, over this long. */
export const BLEND_MS = 30_000;
/** The blend moves in this many steps: a colour changes by about a level a step, so a step is the finest change to draw. */
const STEPS = 255;

/** A time in `[0, CYCLE_MS)`: one cycle wraps into the next, and a time that is not a number is the start of day. */
export const wrapTime = (ms: number): number => (Number.isFinite(ms) ? ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS : 0);

/** The phase at time `ms` of the cycle. */
export function phaseOf(ms: number): Phase {
  return ROUND[at(wrapTime(ms)).index]!;
}

/** The place of time `t` (already wrapped) in the round: the number of its phase in it, and how long is left of that phase. */
function at(t: number): { index: number; left: number } {
  let end = 0;
  for (let index = 0; ; index++) {
    end += PHASE_MS[ROUND[index]!];
    if (t < end) return { index, left: end - t };
  }
}

/** What the world looks like at one time of day. */
export interface WorldLook {
  /** The sky, which the fog fades to. */
  sky: number;
  /** The sun by day, the moon by night: its colour, strength and place in the sky (degrees over the horizon, and round it). */
  sun: number;
  sunIntensity: number;
  elevation: number;
  azimuth: number;
  /** The ambient light: the sky side, the ground side and the strength. */
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** The colour the water is multiplied by. */
  water: number;
  /** How much the hero, the troop, the lairs and the teleporters shine of their own, 0 (not at all) to 1. */
  glow: number;
}

/** The three looks. Night stays readable: the moon is a real key light, the ambient is not black, and the things that matter glow. */
export const WORLD_LOOKS: Readonly<Record<Phase, WorldLook>> = {
  day: { sky: 0x93b5d9, sun: SUN.colour, sunIntensity: 3.2, elevation: SUN.elevation, azimuth: SUN.azimuth, hemiSky: 0xcfe0ff, hemiGround: 0x2a2418, hemiIntensity: 0.9, water: 0xffffff, glow: 0 },
  dusk: { sky: 0x7a4f73, sun: 0xff8a4a, sunIntensity: 2.8, elevation: 9, azimuth: 62, hemiSky: 0xa07ab0, hemiGround: 0x3a2218, hemiIntensity: 0.75, water: 0xf0b0b8, glow: 0.4 },
  night: { sky: 0x060a1c, sun: 0x9db8ff, sunIntensity: 1.3, elevation: 38, azimuth: -30, hemiSky: 0x6a82c8, hemiGround: 0x141a2c, hemiIntensity: 0.65, water: 0x8aa4e0, glow: 1 },
};

const mixNumber = (a: number, b: number, k: number): number => a + (b - a) * k;

/** The colour `k` of the way from `a` to `b` (0 to 1), channel by channel. */
export function mixHex(a: number, b: number, k: number): number {
  const channel = (shift: number): number => Math.round(mixNumber((a >> shift) & 0xff, (b >> shift) & 0xff, k));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The look of the world as the time goes: a phase keeps its look through its middle and blends into the next one's over its last
 * `BLEND_MS` (smoothly, ending on that look, so the change of phase is no jump). With no blend (reduced motion) the look switches
 * where the phase changes. One object that `set` writes into: a frame allocates nothing.
 */
export class Sky {
  readonly look: WorldLook = { ...WORLD_LOOKS.day };
  /** Which look is written: the phase of the round and the blend step. `set` writes when it changes. */
  private stamp = 0;

  /** Moves the look to time `ms`; whether it changed. */
  set(ms: number, blend: boolean): boolean {
    const { index, left } = at(wrapTime(ms));
    const x = blend && left < BLEND_MS ? 1 - left / BLEND_MS : 0;
    const step = Math.round(x * x * (3 - 2 * x) * STEPS);
    const stamp = index * (STEPS + 1) + step;
    if (stamp === this.stamp) return false;
    this.stamp = stamp;
    const [from, to, k] = [WORLD_LOOKS[ROUND[index]!], WORLD_LOOKS[ROUND[(index + 1) % ROUND.length]!], step / STEPS];
    const { look } = this;
    look.sky = mixHex(from.sky, to.sky, k);
    look.sun = mixHex(from.sun, to.sun, k);
    look.sunIntensity = mixNumber(from.sunIntensity, to.sunIntensity, k);
    look.elevation = mixNumber(from.elevation, to.elevation, k);
    look.azimuth = mixNumber(from.azimuth, to.azimuth, k);
    look.hemiSky = mixHex(from.hemiSky, to.hemiSky, k);
    look.hemiGround = mixHex(from.hemiGround, to.hemiGround, k);
    look.hemiIntensity = mixNumber(from.hemiIntensity, to.hemiIntensity, k);
    look.water = mixHex(from.water, to.water, k);
    look.glow = mixNumber(from.glow, to.glow, k);
    return true;
  }
}
