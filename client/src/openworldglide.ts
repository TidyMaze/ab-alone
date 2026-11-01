// The glide of the Open world marbles (docs/specs/openworld.md section 4, #1040): a step slides the hero and each troop marble
// from the cell it left to the one it takes, over about 140 ms, rolling the marble in the way it goes and squashing it on
// landing. Only what is drawn glides: the cells, the collisions and the save are the step's own, and they are exact at once.
// A pure function of time, so it is unit-tested; the view writes the poses it gives.
import * as THREE from 'three/webgpu';
import { EASE } from './motion';

/** The glide of a step, in ms at normal speed: an ease-out that lands on the cell. */
export const GLIDE_MS = 140;
/** The cruise pace of a long walk (#1290), in ms a step: the pace a held key, a held stick or a far tap reaches after a few steps. */
export const CRUISE_MS = 80;
/** The steps of a walk made at `GLIDE_MS` before it speeds up, so a tap and a short walk keep their feel. */
const SLOW_STEPS = 2;
/** How much each step after them is shorter than the one before, in ms, down to `CRUISE_MS`. */
const RAMP_MS = 15;
/** The span in ms of the `n`th step of a walk (0 for the first): the glide lasts as long as the cadence, so the marble never pauses. */
export const stepMs = (n: number): number => Math.max(CRUISE_MS, GLIDE_MS - RAMP_MS * Math.max(0, n - SLOW_STEPS + 1));
/** The lean of a blocked step, in ms: out toward the obstacle and back on the same cell. */
export const NUDGE_MS = 120;
/** How far a blocked marble leans, in cells. */
export const NUDGE = 0.2;
/** The landing squash: the marble is this share shorter at its deepest, and a little wider. */
export const SQUASH = 0.12;
/** The hop (#1100): the marble rises this many cells at mid-step and is on the ground at both ends. */
export const HOP = 0.08;
/** How much later each troop marble starts its step than the one before it, in ms (#1100). */
export const TROOP_DELAY = 25;
/** The hop at `t`: the hop at `t` (0 to 1 of the glide): a sine arch, 0 at both ends, `HOP` at the middle. */
export const hopAt = (t: number): number => (t <= 0 || t >= 1 ? 0 : HOP * Math.sin(Math.PI * t));
/** The share of the glide the squash starts at: it flattens on the last 30 % of the way and is round again on the cell. */
const LANDING = 0.7;
/** The zoom past which a marble draws no roll and no squash: too small on the screen to read them (a far-out view). */
export const ROLL_ZOOM = 3;

/** The control points [x1, y1, x2, y2] of each easing token, read once from the `EASE` strings (no parsing in the frame). */
const CURVES: Record<keyof typeof EASE, readonly [number, number, number, number]> = {
  out: bezierOf(EASE.out),
  in: bezierOf(EASE.in),
  'in-out': bezierOf(EASE['in-out']),
};

function bezierOf(css: string): [number, number, number, number] {
  const [x1, y1, x2, y2] = css.match(/-?[\d.]+/g)!.map(Number);
  return [x1!, y1!, x2!, y2!];
}

/** One coordinate of a cubic bezier from 0 to 1 with controls `a` and `b`, at parameter `s`. */
const bez = (a: number, b: number, s: number): number => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;

/** The eased progress of `t` (0 to 1) along a CSS cubic-bezier, solved by bisection on x: pure, no allocation. */
function cubic(c: readonly [number, number, number, number], t: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(c[0], c[2], mid) < t) lo = mid;
    else hi = mid;
  }
  return bez(c[1], c[3], (lo + hi) / 2);
}

/** The Open world clock (openworld-animation.md section 1): the eased progress of an animation started at `startMs`, read at `nowMs`.
 * 0 before the start, 1 from `startMs + durMs` on, and 1 for a duration of 0 or less. */
export function animT(startMs: number, nowMs: number, durMs: number, ease: keyof typeof EASE): number {
  if (durMs <= 0) return 1;
  const t = (nowMs - startMs) / durMs;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return cubic(CURVES[ease], t);
}

/** The phase of a looping motion, in `[0, 1)`: 0 for a period of 0 or less. */
export function loopT(nowMs: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  const p = (nowMs % periodMs) / periodMs;
  return p < 0 ? p + 1 : p;
}

/** The slow factor of the animations: a webdriver check sets `window.__openworldSlow` to see one in the middle of it. */
export const slowBy = (): number => Number((window as { __openworldSlow?: number }).__openworldSlow ?? 1);

/** A point in the world, as the view draws the marbles. */
export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** The drawn pose of a marble: its place, its turn about the ground, its scale (the squash). */
export interface Pose extends Vec {
  q: THREE.Quaternion;
  sx: number;
  sy: number;
}

/** How a glide is paced (#1065). `tap`: a single step, an ease-out that lands at rest. `start`: the first step of a held walk, from
 * rest up to the walking speed. `walk`: a step of a held walk after another, at the walking speed from end to end. */
export type Pace = 'tap' | 'start' | 'walk';
/** The slopes of each pace, as shares of the step per unit of its time: [at its start, at its end]. The walking speed is 1, a cell
 * per span. A tap is `[3, 0]`, which is exactly 1 - (1 - t)^3. */
const SLOPES: Record<Pace, readonly [number, number]> = { tap: [3, 0], start: [0, 1], walk: [1, 1] };
/** The steepest start a braked glide may take: past 3 the cubic would go back on itself. */
const MAX_SLOPE = 3;

/** The share of the way covered at `t` (0 to 1 of the step) by the cubic that starts with slope `v0` and ends with slope `v1`:
 * a pure function of time, held at 0 before the step and at 1 after it. */
export function shareAt(t: number, v0: number, v1: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * t * (v0 + v1 - 2) + t * t * (3 - 2 * v0 - v1) + t * v0;
}

/** The speed at `t` of `shareAt`: its derivative, in shares of the step per unit of its time; 0 outside the step. */
export function slopeAt(t: number, v0: number, v1: number): number {
  if (t < 0 || t > 1) return 0;
  return 3 * t * t * (v0 + v1 - 2) + 2 * t * (3 - 2 * v0 - v1) + v0;
}

/** A glide: from the pose the marble had when it started, to the place of its new cell, over `span` ms from `start`. The turn is the
 * roll about `axis` in radians: the distance over the radius of the marble. `v0` and `v1` are the slopes of its pace. */
interface Glide {
  from: Pose;
  to: Vec;
  axis: THREE.Vector3;
  turn: number;
  start: number;
  span: number;
  v0: number;
  v1: number;
  /** The hop at the last tick, in cells: drawn on top of the standing pose, never kept in it. */
  hop: number;
}

/** A lean: an offset of `dir` (already the lean's length) in the ground, over `span` ms from `start`, back to nothing at the end. */
interface Lean {
  dir: Vec;
  start: number;
  span: number;
}

/** The squash at `t` (0 to 1 of the glide): 0 until the landing, the deepest half-way through it, 0 again on the cell. */
export function squashAt(t: number): number {
  if (t <= LANDING || t >= 1) return 0;
  return Math.sin((Math.PI * (t - LANDING)) / (1 - LANDING));
}

/** The share of the way a lean covers at `t`: out and back, from the cell to the cell. */
const leanAt = (t: number): number => (t >= 1 ? 0 : Math.sin(Math.PI * t));
/** The fraction of `span` that `now` is past `start`, from 0 to 1. */
const share = (now: number, start: number, span: number): number => Math.min(1, Math.max(0, (now - start) / span));

/** A turn about `axis` by `angle` radians, reused by every glide so a frame allocates none. */
const turned = new THREE.Quaternion();

/** The pose of a glide at `now`, written to `out`: from `from` to `to` at the pace of the glide, the roll of the marble on the way
 * (when `roll`), and the squash on landing when it lands at rest (when `roll`): a marble that goes on to a next step does not
 * squash. Without `roll` the marble keeps its turn and its shape: the far-out view. */
function glidePose(g: Glide, now: number, out: Pose, roll: boolean): void {
  const t = share(now, g.start, g.span);
  const f = shareAt(t, g.v0, g.v1);
  out.x = (1 - f) * g.from.x + f * g.to.x;
  out.y = (1 - f) * g.from.y + f * g.to.y;
  out.z = (1 - f) * g.from.z + f * g.to.z;
  g.hop = roll ? hopAt(t) : 0;
  const s = roll && g.v1 === 0 ? squashAt(t) : 0;
  out.sx = 1 + (SQUASH / 2) * s;
  out.sy = 1 - SQUASH * s;
  if (roll) out.q.multiplyQuaternions(turned.setFromAxisAngle(g.axis, g.turn * f), g.from.q);
  else out.q.copy(g.from.q);
}

const copyPose = (p: Pose): Pose => ({ x: p.x, y: p.y, z: p.z, q: p.q.clone(), sx: p.sx, sy: p.sy });
const newPose = (): Pose => ({ x: 0, y: 0, z: 0, q: new THREE.Quaternion(), sx: 1, sy: 1 });
const sameSpot = (a: Vec, b: Vec): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** A marble of the Open world: where it stands, and the glide or the lean it makes on the way to its cell. `pose` is what is
 * drawn: the standing pose with the lean on top. `radius` is the marble's, for the roll. */
export class Marble {
  readonly pose: Pose = newPose();
  /** Where the marble stands: its cell at rest, or the pose of its glide as it is. */
  private readonly base: Pose = newPose();
  /** The place it is glided or placed to: a glide to the same place is not restarted. */
  private readonly target: Vec = { x: 0, y: 0, z: 0 };
  private glide: Glide | null = null;
  private lean: Lean | null = null;

  constructor(private readonly radius: number) {}

  /** Stands on `to` at once, with no turn: a world entered, a fixture, a reduced motion step. */
  place(to: Vec): void {
    this.base.q.identity();
    this.put(to);
  }

  /** Stands on `to` at once, keeping its turn: where a push puts the marble, drawn by the push's own motion. */
  put(to: Vec): void {
    this.glide = null;
    this.lean = null;
    this.target.x = to.x;
    this.target.y = to.y;
    this.target.z = to.z;
    this.base.x = to.x;
    this.base.y = to.y;
    this.base.z = to.z;
    this.base.sx = 1;
    this.base.sy = 1;
    this.show();
  }

  /** Glides from where the marble is at `now` (ms) to `to`, over `span` ms, rolling it on the way. Returns false, and keeps the glide
   * under way, when it already glides or stands on `to`. `roll` false draws the place without the turn and the squash. `pace` is
   * the step's (#1065): a `tap` eases out, the steps of a held walk keep one speed. */
  go(to: Vec, now: number, span = GLIDE_MS, roll = true, pace: Pace = 'tap', delay = 0): boolean {
    if (sameSpot(this.target, to)) return false;
    this.tick(now, roll);
    const [v0, v1] = SLOPES[pace];
    this.begin(to, now, span, v0, v1, delay);
    this.target.x = to.x;
    this.target.y = to.y;
    this.target.z = to.z;
    return true;
  }

  /** Starts a glide from the standing pose at `now` to `to`, over `span` ms, with the slopes `v0` and `v1`. */
  private begin(to: Vec, now: number, span: number, v0: number, v1: number, delay = 0): void {
    const dx = to.x - this.base.x;
    const dz = to.z - this.base.z;
    const dist = Math.hypot(dx, dz);
    const axis = dist === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(dz / dist, 0, -dx / dist);
    this.glide = { from: copyPose(this.base), to: { x: to.x, y: to.y, z: to.z }, axis, turn: dist / this.radius, start: now + delay, span, v0, v1, hop: 0 };
  }

  /** The walk ends (#1065): the glide under way at the walking speed goes on from its place and speed, slows to nothing, and lands
   * on its cell at the time it was due, squashing on landing. Nothing for a marble that stands, a glide that eases out already
   * (a tap), or one that has landed. */
  brake(now: number, roll = true): void {
    const g = this.glide;
    if (!g || g.v1 === 0) return;
    const t = share(now, g.start, g.span);
    if (t >= 1) return;
    const left = 1 - shareAt(t, g.v0, g.v1);
    const matched = (slopeAt(t, g.v0, g.v1) * (1 - t)) / left; // the speed it has, over what is left
    // A walk that ends in the first moments of its first step is a tap: it still eases out from the start, as a tap does.
    const eager = g.v0 === 0 ? MAX_SLOPE * (1 - t) ** 4 : 0;
    const v0 = Math.min(MAX_SLOPE, Math.max(matched, eager));
    this.tick(now, roll);
    this.begin(g.to, now, (1 - t) * g.span, v0, 0);
  }

  /** Leans the marble by `dir` (a step's direction, in cells) and back, over `span` ms: a blocked step (#1040). It rides on the glide
   * under way, if there is one. */
  bump(dir: Vec, now: number, span = NUDGE_MS): void {
    this.lean = { dir: { x: dir.x * NUDGE, y: 0, z: dir.z * NUDGE }, start: now, span };
  }

  /** Writes the pose at `now` (ms): the glide and the lean, if either is under way. Returns whether the marble moves on this tick,
   * so the view draws it; the last tick of a glide or a lean returns true, the one after it false. */
  tick(now: number, roll = true): boolean {
    const moving = this.glide !== null || this.lean !== null;
    if (this.glide) {
      glidePose(this.glide, now, this.base, roll);
      if (now >= this.glide.start + this.glide.span) this.glide = null;
    }
    if (!moving) return false;
    this.show();
    if (this.glide) this.pose.y += this.glide.hop;
    if (this.lean) {
      const k = leanAt(share(now, this.lean.start, this.lean.span));
      this.pose.x += this.lean.dir.x * k;
      this.pose.z += this.lean.dir.z * k;
      if (now >= this.lean.start + this.lean.span) this.lean = null;
    }
    return true;
  }

  /** The drawn pose is the standing one. */
  private show(): void {
    const { base, pose } = this;
    pose.x = base.x;
    pose.y = base.y;
    pose.z = base.z;
    pose.sx = base.sx;
    pose.sy = base.sy;
    pose.q.copy(base.q);
  }
}
