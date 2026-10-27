import { describe, expect, it } from 'vitest';
import { FreeCameraController } from './freecam';

describe('FreeCameraController', () => {
  it('starts inactive', () => {
    const cam = new FreeCameraController();
    expect(cam.active).toBe(false);
  });

  it('can enable and disable', () => {
    const cam = new FreeCameraController();
    cam.enable({ x: 0, y: 5, z: 10 }, 0, 0);
    expect(cam.active).toBe(true);
    expect(cam.position).toEqual({ x: 0, y: 5, z: 10 });

    cam.disable();
    expect(cam.active).toBe(false);
    expect(cam.keys.size).toBe(0);

    // enable without startPosition preserves default position
    cam.enable();
    expect(cam.active).toBe(true);
    expect(cam.position).toEqual({ x: 0, y: 5, z: 10 });
  });

  it('ignores keys when inactive', () => {
    const cam = new FreeCameraController();
    expect(cam.onKeyDown('KeyW')).toBe(false);
    expect(cam.onKeyUp('KeyW')).toBe(false);
    expect(cam.update(0.1)).toBe(false);
  });

  it('toggles active state', () => {
    const cam = new FreeCameraController();
    expect(cam.toggle({ x: 0, y: 5, z: 10 })).toBe(true);
    expect(cam.active).toBe(true);
    expect(cam.toggle()).toBe(false);
    expect(cam.active).toBe(false);
  });

  it('rotates yaw and pitch on pointer move', () => {
    const cam = new FreeCameraController();
    cam.enable({ x: 0, y: 0, z: 0 }, 0, 0);
    cam.onPointerMove(100, 50); // dx = 100, dy = 50
    expect(cam.yaw).toBeLessThan(0);
    expect(cam.pitch).toBeLessThan(0);

    const target = cam.getLookTarget();
    expect(target.x).toBeDefined();
    expect(target.y).toBeDefined();
    expect(target.z).toBeDefined();
  });

  it('clamps pitch to avoid flipping upside down', () => {
    const cam = new FreeCameraController();
    cam.enable({ x: 0, y: 0, z: 0 }, 0, 0);
    cam.onPointerMove(0, 10000);
    expect(cam.pitch).toBeGreaterThanOrEqual(-Math.PI * 0.48);
    cam.onPointerMove(0, -20000);
    expect(cam.pitch).toBeLessThanOrEqual(Math.PI * 0.48);
  });

  it('ignores pointer move when inactive', () => {
    const cam = new FreeCameraController();
    cam.onPointerMove(10, 10);
    expect(cam.yaw).toBe(0);
    expect(cam.pitch).toBe(0);
  });

  it('handles movement keys and ignores unknown keys', () => {
    const cam = new FreeCameraController(10);
    cam.enable({ x: 0, y: 0, z: 0 }, 0, 0);

    // Unknown keys return false
    expect(cam.onKeyDown('KeyX')).toBe(false);
    expect(cam.onKeyUp('KeyX')).toBe(false);

    // Forward
    expect(cam.onKeyDown('KeyW')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.position.z).toBeLessThan(0);
    expect(cam.onKeyUp('KeyW')).toBe(true);

    // Backward
    expect(cam.onKeyDown('KeyS')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.onKeyUp('KeyS')).toBe(true);

    // Left
    expect(cam.onKeyDown('KeyA')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.onKeyUp('KeyA')).toBe(true);

    // Right
    expect(cam.onKeyDown('KeyD')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.onKeyUp('KeyD')).toBe(true);

    // Up
    expect(cam.onKeyDown('Space')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.position.y).toBeGreaterThan(0);
    expect(cam.onKeyUp('Space')).toBe(true);

    // Down
    expect(cam.onKeyDown('ShiftLeft')).toBe(true);
    expect(cam.update(1.0)).toBe(true);
    expect(cam.onKeyUp('ShiftLeft')).toBe(true);

    // Opposing keys cancelling movement vector returns false
    cam.onKeyDown('KeyW');
    cam.onKeyDown('KeyS');
    expect(cam.update(1.0)).toBe(false);
    cam.onKeyUp('KeyW');
    cam.onKeyUp('KeyS');

    // KeyUp on a key that was not pressed returns false
    expect(cam.onKeyUp('KeyW')).toBe(false);

    // Update with no active keys returns false
    expect(cam.update(1.0)).toBe(false);
  });
});
