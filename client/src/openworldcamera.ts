// The camera's little life in the Open world (docs/specs/openworld-animation.md section 5, #1103): a zoom punch on a troop push, a
// short shake when an enemy is ejected. Each is an offset of at most 250 ms, a pure function of time, applied on top of the camera by
// the view and gone at the end: the zoom the player set, the yaw, the hero's cell and the chunk centre are never touched. The follow
// of the hero, the turn and the zoom are `Damped` (#1333), driven by the frame's own time. Plain numbers, nothing allocated in a frame.
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

/** Below this offset and speed a `Damped` is at rest: it snaps onto its target and stops asking for frames. */
const REST = 1e-4;

/** A value that closes on its target the critically damped way (#1333): no overshoot, and it starts with the speed it has, so a
 * target that jumps or moves never makes a step in the speed. `offset` is the value minus its target. The step is exact for a target
 * held over the frame, so the same time gives the same result at any refresh rate. */
export class Damped {
  offset = 0;
  speed = 0;

  /** Closes `dt` seconds on, with the natural frequency `omega` (rad/s; the offset falls by 1/e in about 1/omega). Returns whether it
   * moved: false once it is at rest. */
  step(omega: number, dt: number): boolean {
    if (this.offset === 0 && this.speed === 0) return false;
    const carry = this.speed + omega * this.offset;
    const decay = Math.exp(-omega * dt);
    this.offset = (this.offset + carry * dt) * decay;
    this.speed = (this.speed - omega * carry * dt) * decay;
    if (Math.abs(this.offset) < REST && Math.abs(this.speed) < REST) this.rest();
    return true;
  }

  /** On the target at once, at rest. */
  rest(): void {
    this.offset = 0;
    this.speed = 0;
  }
}

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
