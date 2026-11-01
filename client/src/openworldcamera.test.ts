import { describe, expect, it } from 'vitest';
import { CameraLife, Damped, PUNCH, PUNCH_MS, SHAKE_MS, SHAKE_PX } from './openworldcamera';

describe('the camera offsets of the Open world (docs/specs/openworld-animation.md section 5, #1103)', () => {
  it('lasts 250 ms at most, each one', () => {
    for (const ms of [PUNCH_MS, SHAKE_MS]) expect(ms).toBeLessThanOrEqual(250);
  });

  it('is at the base values when nothing was started', () => {
    const life = new CameraLife();
    expect(life.at(1000)).toBe(false);
    expect([life.zoom, life.shakeX]).toEqual([1, 0]);
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

  it('runs the two together and stays active until the last one ends', () => {
    const life = new CameraLife();
    life.punch(0);
    life.shake(0);
    expect(life.at(PUNCH_MS - 1)).toBe(true);
    expect(life.at(Math.max(PUNCH_MS, SHAKE_MS))).toBe(false);
  });

  it('is cut by reset: the base values at once', () => {
    const life = new CameraLife();
    life.punch(0);
    life.shake(0);
    life.at(50);
    life.reset();
    expect(life.at(60)).toBe(false);
    expect([life.zoom, life.shakeX]).toEqual([1, 0]);
  });
});

describe('the critically damped follow of the camera (#1333)', () => {
  const run = (offset: number, speed: number, omega: number, fps: number, seconds: number): Damped => {
    const d = new Damped();
    d.offset = offset;
    d.speed = speed;
    for (let i = 0; i < Math.round(fps * seconds); i++) d.step(omega, 1 / fps);
    return d;
  };

  it('starts from rest with no jump in speed and closes on zero without crossing it', () => {
    const d = new Damped();
    d.offset = 1;
    d.step(20, 1 / 10000);
    expect(Math.abs(d.speed)).toBeLessThan(0.05); // a first-order ease would start at 20 a second
    let lowest = d.offset;
    for (let i = 0; i < 240; i++) {
      d.step(20, 1 / 60);
      lowest = Math.min(lowest, d.offset);
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(d.offset).toBe(0); // settled: exactly on it
    expect(d.speed).toBe(0);
  });

  it('is the same at 30, 60 and 144 frames a second', () => {
    const at60 = run(1, 0.5, 20, 60, 0.5);
    for (const fps of [30, 144, 240]) {
      const d = run(1, 0.5, 20, fps, 0.5);
      expect(d.offset).toBeCloseTo(at60.offset, 9);
      expect(d.speed).toBeCloseTo(at60.speed, 9);
    }
  });

  it('keeps the speed it has when the target moves, and reports whether it moves', () => {
    const d = new Damped();
    d.offset = 0;
    d.speed = 3;
    expect(d.step(20, 1 / 60)).toBe(true);
    expect(d.offset).toBeGreaterThan(0.03);
    expect(new Damped().step(20, 1 / 60)).toBe(false);
  });

  it('can be cut to rest at once', () => {
    const d = run(1, 1, 20, 60, 0.05);
    d.rest();
    expect([d.offset, d.speed]).toEqual([0, 0]);
  });
});
