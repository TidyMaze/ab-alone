// The water and the trees of the Open world move (#1101, #1102, docs/specs/openworld-animation.md sections 3 and 4). Nothing here adds a
// draw call or writes an instance: the shore foam, the ripples and the sway of the trees are terms of the materials the meshes already
// have, driven by a few uniforms the frame sets (one time, two amplitudes, four ripples). The pure functions are the maths of those
// terms, which the unit tests read.
import * as THREE from 'three/webgpu';
import { abs, clamp, cos, float, instanceColor, instanceIndex, length, materialEmissive, normalLocal, positionGeometry, positionLocal, positionWorld, sin, smoothstep, step, uniform, vec3 } from 'three/tsl';

/** The ripples at most live at once, how long one lasts, how far it grows in cells and how bright it starts (spec section 3). */
export const RIPPLES = 4;
export const RIPPLE_MS = 600;
export const RIPPLE_REACH = 1.2;
export const RIPPLE_ALPHA = 0.5;
/** The shore foam: its period in ms and how much it brightens the shore cell at most. */
export const FOAM_MS = 3200;
export const FOAM_GAIN = 0.25;
/** The sway of a tree: its period in ms and its lean in degrees (spec section 4). */
export const SWAY_MS = 4000;
export const SWAY_DEG = 2;
const SWAY_TAN = Math.tan((SWAY_DEG * Math.PI) / 180);
/** The heat shimmer of the desert (#1104, spec section 6): the top of a sand cell rises and falls `SHIMMER_AMP` cell (about a pixel at the
 * usual zoom) in `SHIMMER_MS`. */
export const SHIMMER_MS = 3000;
export const SHIMMER_AMP = 0.02;
/** The width of a ripple's ring in cells, and the colour of the foam and the ring: a pale cyan of the lake's own palette. */
const RING_WIDTH = 0.12;
const FOAM_COLOUR = [0.55, 0.8, 0.9] as const;

/** A ripple `age` ms old (the slow check stretches it by `slow`): its radius in cells and its alpha, null before it starts and from the
 * end of its life. The radius eases out, the alpha fades linearly. */
export function rippleAt(age: number, slow: number): { radius: number; alpha: number } | null {
  const span = RIPPLE_MS * slow;
  if (age < 0 || age >= span) return null;
  const left = 1 - age / span;
  return { radius: RIPPLE_REACH * (1 - left * left * left), alpha: RIPPLE_ALPHA * left };
}

/** The sideways lean of a tree's top, as a share of its height, at `ms` and a `phase` in radians. */
export const swayLean = (ms: number, phase: number): number => SWAY_TAN * Math.sin((2 * Math.PI * ms) / SWAY_MS + phase);

/** The rise of the top of a sand cell at `ms`, in cells, for a `phase` in radians. */
export const shimmerRise = (ms: number, phase: number): number => SHIMMER_AMP * Math.sin((2 * Math.PI * ms) / SHIMMER_MS + phase);

/** The ripples: a pool of fixed size, a free slot (or else the oldest) taken by the next, no allocation. `x`, `z` and `start` are read by
 * `writeRipples`. */
export class RipplePool {
  readonly cap = RIPPLES;
  readonly x = new Float32Array(RIPPLES);
  readonly z = new Float32Array(RIPPLES);
  readonly start = new Float64Array(RIPPLES).fill(-Infinity);

  /** A ripple at (`x`, `z`) from `now` (ms), replacing the oldest. */
  spawn(x: number, z: number, now: number): void {
    let oldest = 0;
    for (let i = 1; i < this.cap; i++) if (this.start[i]! < this.start[oldest]!) oldest = i;
    this.x[oldest] = x;
    this.z[oldest] = z;
    this.start[oldest] = now;
  }

  /** How many ripples are alive at `now` (ms), for a slow check of `slow` times as long. */
  live(now: number, slow = 1): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (now - this.start[i]! < RIPPLE_MS * slow) n++;
    return n;
  }

  /** Ends every ripple at once. */
  clear(): void {
    this.start.fill(-Infinity);
  }
}

/** What the shaders read, set by the frame: `time` (ms), the amplitude of the foam, of the sway and of the shimmer (0 off, 1 on), the span of a ripple
 * in ms (the slow check), and the four ripples as (x, z, start ms, unused). */
export interface MotionUniforms {
  time: THREE.UniformNode<'float', number>;
  foam: THREE.UniformNode<'float', number>;
  sway: THREE.UniformNode<'float', number>;
  shimmer: THREE.UniformNode<'float', number>;
  span: THREE.UniformNode<'float', number>;
  ripples: THREE.UniformNode<'vec4', THREE.Vector4>[];
}

/** The start of a free slot, far enough back for its ripple to be over. */
const NEVER = -1e9;

/** A fresh set of uniforms, everything off. */
export function motionUniforms(): MotionUniforms {
  return {
    time: uniform(0),
    foam: uniform(0),
    sway: uniform(0),
    shimmer: uniform(0),
    span: uniform(RIPPLE_MS),
    ripples: Array.from({ length: RIPPLES }, () => uniform(new THREE.Vector4(0, 0, NEVER, 0))),
  };
}

/** Copies the pool to the uniforms: a free slot gets a start far in the past. */
export function writeRipples(pool: RipplePool, u: MotionUniforms): void {
  for (let i = 0; i < RIPPLES; i++) u.ripples[i]!.value.set(pool.x[i]!, pool.z[i]!, Number.isFinite(pool.start[i]!) ? pool.start[i]! : NEVER, 0);
}

/** The emissive of the water: its own glow, the shore foam on the cells that touch land and the rings of the ripples, on the top face.
 * `shore` and `deep` are the red of a lone water cell and of a cell in the middle of a lake (the instance colour holds a share of
 * land neighbours, so the foam reads it), in the working colour space. */
export function waterEmissive(u: MotionUniforms, shore: number, deep: number): THREE.Node {
  const step1 = (shore - deep) / 6; // one land neighbour's share of the colour
  const foamMask = smoothstep(0.4 * step1, 0.8 * step1, instanceColor.r.sub(deep));
  const phase = positionWorld.x.mul(1.7).add(positionWorld.z.mul(2.3));
  const wave = sin(u.time.mul((2 * Math.PI) / FOAM_MS).add(phase)).mul(0.5).add(0.5);
  let glow = foamMask.mul(wave).mul(u.foam);
  for (const ripple of u.ripples) {
    const age = u.time.sub(ripple.z).div(u.span);
    const live = step(0, age).mul(step(age, 0.9999));
    const left = float(1).sub(clamp(age, 0, 1));
    const radius = float(RIPPLE_REACH).mul(float(1).sub(left.mul(left).mul(left)));
    const distance = length(positionWorld.xz.sub(ripple.xy));
    const ring = float(1).sub(smoothstep(0, RING_WIDTH, abs(distance.sub(radius))));
    glow = glow.add(ring.mul(float(RIPPLE_ALPHA).mul(left)).mul(live));
  }
  const top = step(0.5, normalLocal.y); // the sides of the column keep their glow
  return materialEmissive.add(vec3(...FOAM_COLOUR).mul(glow).mul(top));
}

/** The position of a tree's vertex: it leans sideways by its height (the instance's own index makes the phase), never past 2 degrees.
 * Read after the instance matrix, so the tree sways where it stands and no instance is written. */
export function swayPosition(u: MotionUniforms): THREE.Node {
  const angle = u.time.mul((2 * Math.PI) / SWAY_MS).add(float(instanceIndex).mul(2.39996));
  const lean = u.sway.mul(SWAY_TAN).mul(clamp(positionGeometry.y.add(0.5), 0, 1));
  return positionLocal.add(vec3(sin(angle).mul(lean), 0, cos(angle).mul(lean).mul(0.6)));
}

/** The position of a sand vertex: the top face rises and falls a pixel, each cell in its own phase (the instance's index), the foot of the
 * column stays. Nothing is written to an instance, and it is 0 unless the hero stands in the desert. */
export function shimmerPosition(u: MotionUniforms): THREE.Node {
  const angle = u.time.mul((2 * Math.PI) / SHIMMER_MS).add(float(instanceIndex).mul(2.39996));
  const top = step(0, positionGeometry.y);
  return positionLocal.add(vec3(0, sin(angle).mul(SHIMMER_AMP).mul(u.shimmer).mul(top), 0));
}
