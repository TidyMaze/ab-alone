import { describe, expect, it } from 'vitest';
import { CameraLife, PAN, PAN_MS, PUNCH, PUNCH_MS, SHAKE_MS, SHAKE_PX } from './openworldcamera';

describe('the camera offsets of the Open world (docs/specs/openworld-animation.md section 5, #1103)', () => {
  it('lasts 250 ms at most, each one', () => {
    for (const ms of [PUNCH_MS, PAN_MS, SHAKE_MS]) expect(ms).toBeLessThanOrEqual(250);
  });

  it('is at the base values when nothing was started', () => {
    const life = new CameraLife();
    expect(life.at(1000)).toBe(false);
    expect([life.zoom, life.panX, life.panZ, life.shakeX]).toEqual([1, 0, 0, 0]);
  });

  it('punches the zoom in by 3 % at the middle and is exactly back at the end', () => {
    const life = new CameraLife();
    life.punch(1000);
    expect(life.at(1000)).toBe(true);
    expect(life.zoom).toBe(1);
    expect(life.at(1000 + PUNCH_MS / 2)).toBe(true);
    expect(life.zoom).toBeCloseTo(1 - PUNCH, 9);
    expect(life.at(1000 + PUNCH_MS / 4)).toBe(true);
    expect(life.zoom).toBeLessThan(1);
    expect(life.zoom).toBeGreaterThan(1 - PUNCH);
    expect(life.at(1000 + PUNCH_MS)).toBe(false);
    expect(life.zoom).toBe(1);
  });

  it('shakes 2 px at most, decaying over 3 oscillations, and rests exactly at the end', () => {
    const life = new CameraLife();
    life.shake(1000);
    let peak = 0;
    let signs = 0;
    let last = 0;
    for (let ms = 1; ms < SHAKE_MS; ms++) {
      expect(life.at(1000 + ms)).toBe(true);
      peak = Math.max(peak, Math.abs(life.shakeX));
      if (last * life.shakeX < 0) signs++;
      if (life.shakeX !== 0) last = life.shakeX;
    }
    expect(peak).toBeLessThanOrEqual(SHAKE_PX);
    expect(peak).toBeGreaterThan(SHAKE_PX / 2);
    expect(signs).toBeGreaterThanOrEqual(5); // 3 oscillations cross zero about 6 times
    expect(life.at(1000 + SHAKE_MS)).toBe(false);
    expect(life.shakeX).toBe(0);
  });

  it('lags the follow at the start of a walk and eases to the hero', () => {
    const life = new CameraLife();
    life.pan(1000, 1, 0, -1);
    life.at(1000);
    expect(life.panX).toBeCloseTo(-PAN, 9); // behind the hero, which goes toward +x
    expect(life.panZ).toBeCloseTo(0, 9);
    life.at(1000 + PAN_MS / 2);
    expect(Math.abs(life.panX)).toBeLessThan(PAN);
    expect(life.at(1000 + PAN_MS)).toBe(false);
    expect([life.panX, life.panZ]).toEqual([0, 0]);
  });

  it('carries on a little at the end of a walk, in the direction it went, and settles', () => {
    const life = new CameraLife();
    life.pan(1000, 0, 1, -1);
    life.at(1000 + PAN_MS);
    life.panEnd(2000);
    life.at(2000);
    expect(life.panZ).toBeCloseTo(PAN, 9);
    expect(life.at(2000 + PAN_MS)).toBe(false);
    expect(life.panZ).toBe(0);
  });

  it('runs the three together and stays active until the last one ends', () => {
    const life = new CameraLife();
    life.punch(0);
    life.shake(0);
    life.pan(0, 1, 0, -1);
    expect(life.at(PUNCH_MS - 1)).toBe(true);
    expect(life.at(Math.max(PUNCH_MS, SHAKE_MS, PAN_MS))).toBe(false);
  });

  it('is cut by reset: the base values at once', () => {
    const life = new CameraLife();
    life.punch(0);
    life.shake(0);
    life.pan(0, 1, 0, -1);
    life.at(50);
    life.reset();
    expect(life.at(60)).toBe(false);
    expect([life.zoom, life.panX, life.shakeX]).toEqual([1, 0, 0]);
  });
});
