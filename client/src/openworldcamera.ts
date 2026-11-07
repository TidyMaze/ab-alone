// The camera's little life in the Open world (docs/specs/openworld-animation.md section 5, #1103): a zoom punch on a troop push and a
// short shake when an enemy is ejected. Each is an offset of at most 250 ms, a pure function of time, applied on top of the camera by
// the view and gone at the end: the zoom the player set, the yaw, the hero's cell and the chunk centre are never touched. Under them,
// the camera follows the hero, its turn and its zoom by springs (`Spring`, #1333). Plain numbers, nothing allocated in a frame.
import { MOTION } from './motion';
import { animT } from './openworldglide';

/** The zoom punch: the zoom goes in by this share, then back. */
export const PUNCH = 0.03;
export const PUNCH_MS = MOTION.base;
/** The shake: the largest offset in pixels, decaying over `WAVES` oscillations (`motion.shake`, 200 ms). */
export const SHAKE_PX = 2;
export const SHAKE_MS = 200;
const WAVES = 3;

const NEVER = -Infinity;

export class CameraLife {
  /** The factor on the drawn zoom: 1, or a little under 1 during a punch. */
  zoom = 1;
  /** The horizontal offset of the image, in pixels. */
  shakeX = 0;
  private punchAt = NEVER;
  private shakeAt = NEVER;

  /** A push lands at `now` (ms): the zoom goes in, then back. */
  punch(now: number): void {
    this.punchAt = now;
  }

  /** An enemy is ejected at `now` (ms): a short shake. */
  shake(now: number): void {
    this.shakeAt = now;
  }

  /** Cuts every offset: the base values at once. */
  reset(): void {
    this.punchAt = this.shakeAt = NEVER;
    this.zoom = 1;
    this.shakeX = 0;
  }

  /** Writes the offsets at `now` (ms). Returns whether one is still running; once none is, every value is exactly its base. */
  at(now: number): boolean {
    const punch = now - this.punchAt;
    const shake = now - this.shakeAt;
    const punching = punch < PUNCH_MS;
    const shaking = shake < SHAKE_MS;
    if (punching) {
      const half = PUNCH_MS / 2;
      const into = punch < half ? animT(0, punch, half, 'out') : 1 - animT(half, punch, half, 'in');
      this.zoom = 1 - PUNCH * into;
    } else this.zoom = 1;
    const s = Math.max(0, shake) / SHAKE_MS; // rests before it starts, a push that lands later
    this.shakeX = shaking ? SHAKE_PX * (1 - s) * Math.sin(2 * Math.PI * WAVES * s) : 0;
    return punching || shaking;
  }
}

/** The framing of a narrow screen (#1534): a tower within `FRAME_REACH` cells of the hero pulls the look `FRAME_SHARE` of the way to it, so a
 * phone sees the tower the hero walks to, not only the hero. The share is of the ground offset, on each axis. */
export const FRAME_REACH = 8;
export const FRAME_SHARE = 0.5;

/** The offset of the look from the hero on the ground (x, z), for the tower at `goal`, `cells` cells away: nothing unless the screen is
 * `narrow` and the tower is within `FRAME_REACH`. */
export function framingShift(hero: { x: number; z: number }, goal: { x: number; z: number }, cells: number, narrow: boolean): { x: number; z: number } {
  if (!narrow || cells > FRAME_REACH) return { x: 0, z: 0 };
  return { x: (goal.x - hero.x) * FRAME_SHARE, z: (goal.z - hero.z) * FRAME_SHARE };
}

/** A value of the camera that follows its goal as a critically damped spring (#1333): the point it looks at, its turn, its zoom. Its
 * speed never jumps, whatever the goal does: a step of the goal starts it from rest, a change of the goal's speed bends its own
 * speed over a few frames. It is integrated exactly for any frame time, so a long frame (a hidden tab) lands near the goal and never
 * overshoots it. `rate` is in 1/s: the larger, the closer it follows. Once within `settled` of the goal, nearly at rest, it lands on it. */
export class Spring {
  /** The speed, in units per second. */
  private v = 0;

  constructor(
    public x: number,
    private readonly rate = 25,
    private readonly settled = 1e-3,
  ) {}

  /** Moves `dt` seconds on toward `goal`. Returns whether the value moved: false at rest on the goal, or for no time. */
  step(goal: number, dt: number): boolean {
    const gap = this.x - goal;
    if ((gap === 0 && this.v === 0) || dt <= 0) return false;
    const w = this.rate;
    const fade = Math.exp(-w * dt);
    const c = this.v + w * gap;
    const next = (gap + c * dt) * fade;
    this.v = (this.v - w * c * dt) * fade;
    if (Math.abs(next) <= this.settled && Math.abs(this.v) <= this.settled * w) this.place(goal);
    else this.x = goal + next;
    return true;
  }

  /** Lands on `to` at once, at rest. Returns whether it moved. */
  place(to: number): boolean {
    const moved = this.x !== to || this.v !== 0;
    this.x = to;
    this.v = 0;
    return moved;
  }
}
