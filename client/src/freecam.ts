// Free flight camera controller for inspecting 3D scenery, props, and lighting.
// Supports WASD / ZQSD (AZERTY), Space (up), Shift (down), and mouse look.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const PITCH_LIMIT = Math.PI * 0.48;
const DEFAULT_SPEED = 14; // units per second
const SENSITIVITY = 0.003; // radians per pixel

export class FreeCameraController {
  active = false;
  position: Vec3 = { x: 0, y: 5, z: 12 };
  yaw = 0; // horizontal rotation in radians
  pitch = 0; // vertical rotation in radians

  readonly keys = new Set<string>();

  constructor(public speed = DEFAULT_SPEED) {}

  enable(startPosition?: Vec3, startYaw = 0, startPitch = 0): void {
    this.active = true;
    if (startPosition) {
      this.position = { ...startPosition };
    }
    this.yaw = startYaw;
    this.pitch = startPitch;
    this.keys.clear();
  }

  disable(): void {
    this.active = false;
    this.keys.clear();
  }

  toggle(startPosition?: Vec3, startYaw?: number, startPitch?: number): boolean {
    if (this.active) {
      this.disable();
    } else {
      this.enable(startPosition, startYaw, startPitch);
    }
    return this.active;
  }

  onPointerMove(dx: number, dy: number): void {
    if (!this.active) return;
    this.yaw -= dx * SENSITIVITY;
    this.pitch -= dy * SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  onKeyDown(code: string): boolean {
    if (!this.active) return false;
    if (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'KeyZ' ||
      code === 'KeyQ' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space' ||
      code === 'ShiftLeft' ||
      code === 'ShiftRight'
    ) {
      this.keys.add(code);
      return true;
    }
    return false;
  }

  onKeyUp(code: string): boolean {
    if (!this.active) return false;
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  /**
   * Updates position according to pressed movement keys and dt (in seconds).
   * Returns true if position changed.
   */
  update(dt: number): boolean {
    if (!this.active || this.keys.size === 0) return false;

    // Forward direction on horizontal plane + pitch
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    // Forward vector (looking towards -Z when yaw=0)
    const forwardX = -sinYaw * cosPitch;
    const forwardY = sinPitch;
    const forwardZ = -cosYaw * cosPitch;

    // Right vector (perpendicular to forward on ground)
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;

    // Forward / Backward
    if (this.keys.has('KeyW') || this.keys.has('KeyZ') || this.keys.has('ArrowUp')) {
      moveX += forwardX;
      moveY += forwardY;
      moveZ += forwardZ;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      moveX -= forwardX;
      moveY -= forwardY;
      moveZ -= forwardZ;
    }

    // Strafe Left / Right
    if (this.keys.has('KeyA') || this.keys.has('KeyQ') || this.keys.has('ArrowLeft')) {
      moveX -= rightX;
      moveZ -= rightZ;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      moveX += rightX;
      moveZ += rightZ;
    }

    // Vertical Up / Down
    if (this.keys.has('Space')) {
      moveY += 1;
    }
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      moveY -= 1;
    }

    const len = Math.hypot(moveX, moveY, moveZ);
    if (len === 0) return false;

    const step = (this.speed * dt) / len;
    this.position.x += moveX * step;
    this.position.y += moveY * step;
    this.position.z += moveZ * step;
    return true;
  }

  /** Point in space camera looks towards (position + unit forward vector). */
  getLookTarget(): Vec3 {
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    return {
      x: this.position.x - sinYaw * cosPitch,
      y: this.position.y + sinPitch,
      z: this.position.z - cosYaw * cosPitch,
    };
  }
}
