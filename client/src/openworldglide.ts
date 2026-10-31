// The glide of the Open world marbles (docs/specs/openworld.md section 4, #1040): a step slides the hero and each troop marble
// from the cell it left to the one it takes, over about 140 ms, rolling the marble in the way it goes and squashing it on
// landing. Only what is drawn glides: the cells, the collisions and the save are the step's own, and they are exact at once.
// A pure function of time, so it is unit-tested; the view writes the poses it gives.
import * as THREE from 'three/webgpu';

/** The glide of a step, in ms at normal speed: an ease-out that lands on the cell. */
export const GLIDE_MS = 140;
/** The lean of a blocked step, in ms: out toward the obstacle and back on the same cell. */
export const NUDGE_MS = 120;
/** How far a blocked marble leans, in cells. */
export const NUDGE = 0.2;
/** The landing squash: the marble is this share shorter at its deepest, and a little wider. */
export const SQUASH = 0.12;
/** The share of the glide the squash starts at: it flattens on the last 30 % of the way and is round again on the cell. */
const LANDING = 0.7;
/** The zoom past which a marble draws no roll and no squash: too small on the screen to read them (a far-out view). */
export const ROLL_ZOOM = 3;

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

/** A glide: from the pose the marble had when it started, to the place of its new cell, over `span` ms from `start`. The turn is the
 * roll about `axis` in radians: the distance over the radius of the marble. */
interface Glide {
  from: Pose;
  to: Vec;
  axis: THREE.Vector3;
  turn: number;
  start: number;
  span: number;
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

/** The share of the way an ease-out covers at `t`: fast at first, slow on the cell. */
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
/** The share of the way a lean covers at `t`: out and back, from the cell to the cell. */
const leanAt = (t: number): number => (t >= 1 ? 0 : Math.sin(Math.PI * t));
/** The fraction of `span` that `now` is past `start`, from 0 to 1. */
const share = (now: number, start: number, span: number): number => Math.min(1, Math.max(0, (now - start) / span));

/** A turn about `axis` by `angle` radians, reused by every glide so a frame allocates none. */
const turned = new THREE.Quaternion();

/** The pose of a glide at `now`, written to `out`: an ease-out from `from` to `to`, the roll of the marble on the way (when `roll`),
 * and the squash on landing (when `roll`). Without `roll` the marble keeps its turn and its shape: the far-out view. */
function glidePose(g: Glide, now: number, out: Pose, roll: boolean): void {
  const t = share(now, g.start, g.span);
  const f = easeOutCubic(t);
  out.x = (1 - f) * g.from.x + f * g.to.x;
  out.y = (1 - f) * g.from.y + f * g.to.y;
  out.z = (1 - f) * g.from.z + f * g.to.z;
  const s = roll ? squashAt(t) : 0;
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
   * under way, when it already glides or stands on `to`. `roll` false draws the place without the turn and the squash. */
  go(to: Vec, now: number, span = GLIDE_MS, roll = true): boolean {
    if (sameSpot(this.target, to)) return false;
    this.tick(now, roll);
    const dx = to.x - this.base.x;
    const dz = to.z - this.base.z;
    const dist = Math.hypot(dx, dz);
    const axis = dist === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(dz / dist, 0, -dx / dist);
    this.glide = { from: copyPose(this.base), to: { x: to.x, y: to.y, z: to.z }, axis, turn: dist / this.radius, start: now, span };
    this.target.x = to.x;
    this.target.y = to.y;
    this.target.z = to.z;
    return true;
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
