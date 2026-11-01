// The camera's little life in the Open world (docs/specs/openworld-animation.md section 5, #1103): a zoom punch on a troop push, a
// pan ease at the start and end of a walk, a short shake when an enemy is ejected. Each is an offset of at most 250 ms, a pure function
// of time, applied on top of the camera by the view and gone at the end: the zoom the player set, the yaw, the hero's cell and the
// chunk centre are never touched. Plain numbers, nothing allocated in a frame.
import { MOTION } from './motion';
import { animT } from './openworldglide';

/** The zoom punch: the zoom goes in by this share, then back. */
export const PUNCH = 0.03;
export const PUNCH_MS = MOTION.base;
/** The pan ease: how far, in cells, the follow is off the hero at the start of its ease. Under one cell, the existing follow lag. */
export const PAN = 0.15;
export const PAN_MS = MOTION.base;
/** The shake: the largest offset in pixels, decaying over `WAVES` oscillations (`motion.shake`, 200 ms). */
export const SHAKE_PX = 2;
export const SHAKE_MS = 200;
const WAVES = 3;

const NEVER = -Infinity;

export class CameraLife {
  /** The factor on the drawn zoom: 1, or a little under 1 during a punch. */
  zoom = 1;
  /** The offset of the point the camera looks at, in world units. */
  panX = 0;
  panZ = 0;
  /** The horizontal offset of the image, in pixels. */
  shakeX = 0;
  private punchAt = NEVER;
  private panAt = NEVER;
  private shakeAt = NEVER;
  private dirX = 0;
  private dirZ = 0;
  private sign = 0;

  /** A push lands at `now` (ms): the zoom goes in, then back. */
  punch(now: number): void {
    this.punchAt = now;
  }

  /** An enemy is ejected at `now` (ms): a short shake. */
  shake(now: number): void {
    this.shakeAt = now;
  }

  /** The follow eases from `now` (ms), along the unit direction (`dx`, `dz`) of the walk: `sign` -1 lags behind the hero (a walk starts), 1
   * is a little ahead of it (a walk ends). */
  pan(now: number, dx: number, dz: number, sign: -1 | 1): void {
    this.panAt = now;
    this.dirX = dx;
    this.dirZ = dz;
    this.sign = sign;
  }

  /** The walk ends at `now` (ms): the follow carries on a little in the direction of the last pan and settles. */
  panEnd(now: number): void {
    this.pan(now, this.dirX, this.dirZ, 1);
  }

  /** Cuts every offset: the base values at once. */
  reset(): void {
    this.punchAt = this.panAt = this.shakeAt = NEVER;
    this.zoom = 1;
    this.panX = this.panZ = this.shakeX = 0;
  }

  /** Writes the offsets at `now` (ms). Returns whether one is still running; once none is, every value is exactly its base. */
  at(now: number): boolean {
    const punch = now - this.punchAt;
    const pan = now - this.panAt;
    const shake = now - this.shakeAt;
    const punching = punch < PUNCH_MS;
    const panning = pan < PAN_MS;
    const shaking = shake < SHAKE_MS;
    if (punching) {
      const half = PUNCH_MS / 2;
      const into = punch < half ? animT(0, punch, half, 'out') : 1 - animT(half, punch, half, 'in');
      this.zoom = 1 - PUNCH * into;
    } else this.zoom = 1;
    const lag = panning ? this.sign * PAN * (1 - animT(0, pan, PAN_MS, 'in-out')) : 0;
    this.panX = this.dirX * lag;
    this.panZ = this.dirZ * lag;
    const s = shake / SHAKE_MS;
    this.shakeX = shaking ? SHAKE_PX * (1 - s) * Math.sin(2 * Math.PI * WAVES * s) : 0;
    return punching || panning || shaking;
  }
}
