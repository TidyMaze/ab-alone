import { describe, expect, it } from 'vitest';
import { CameraLife, PUNCH, PUNCH_MS, SHAKE_MS, SHAKE_PX, Spring } from './openworldcamera';

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

describe('the follow of the Open world camera (#1333)', () => {
  /** Frames of 16.7 ms, every other one late by a few ms: the frame clock of a busy page. */
  const frames = (count: number): number[] => Array.from({ length: count }, (_, i) => (i % 3 === 0 ? 0.021 : i % 3 === 1 ? 0.013 : 0.0167));

  /** The largest change of speed between two frames, in units per second per second, of the values `xs` at the times `ts` (s). */
  const worstAcceleration = (xs: number[], ts: number[]): number => {
    let worst = 0;
    for (let i = 2; i < xs.length; i++) {
      const v1 = (xs[i - 1]! - xs[i - 2]!) / (ts[i - 1]! - ts[i - 2]!);
      const v2 = (xs[i]! - xs[i - 1]!) / (ts[i]! - ts[i - 1]!);
      worst = Math.max(worst, Math.abs(v2 - v1) / (ts[i]! - ts[i - 1]!));
    }
    return worst;
  };

  it('follows a goal whose speed changes at each step with a continuous speed: no step in the camera', () => {
    // The hero's walk (#1290): a cell every 140 ms, then 125, 110, 95 and 80 ms, its speed changing at once at each new step.
    const spans = [0.14, 0.14, 0.125, 0.11, 0.095, 0.08, 0.08, 0.08];
    const heroAt = (t: number): number => {
      let x = 0;
      for (const span of spans) {
        if (t <= span) return x + t / span;
        t -= span;
        x += 1;
      }
      return x;
    };
    const spring = new Spring(0);
    const ts = [0];
    const xs = [0];
    const goals = [0];
    let t = 0;
    for (const dt of frames(60)) {
      t += dt;
      spring.step(heroAt(t), dt);
      ts.push(t);
      xs.push(spring.x);
      goals.push(heroAt(t));
    }
    // The goal's speed jumps at each step, from rest to 7 cells/s at the first; the spring spreads every change over several frames.
    expect(worstAcceleration(xs, ts)).toBeLessThan(worstAcceleration(goals, ts) / 3);
    expect(spring.x).toBeLessThanOrEqual(spans.length); // never ahead of the hero
  });

  it('starts from rest with no jump when the goal jumps, and lands on it without overshoot', () => {
    const spring = new Spring(0);
    const ts = [0];
    const xs = [0];
    let t = 0;
    for (const dt of frames(90)) {
      t += dt;
      spring.step(1, dt);
      ts.push(t);
      xs.push(spring.x);
    }
    expect(xs[1]! / (ts[1]! - ts[0]!)).toBeLessThan((xs[2]! - xs[1]!) / (ts[2]! - ts[1]!)); // the speed starts at 0 and grows
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!); // only toward the goal
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    expect(spring.x).toBe(1); // settled: exactly on the goal
    expect(spring.step(1, 0.0167)).toBe(false); // and nothing moves any more
  });

  it('is exact for any frame time: a long frame lands near the goal, a frame of no time or a clock that went back moves nothing', () => {
    const spring = new Spring(0);
    expect(spring.step(1, 0)).toBe(false);
    expect(spring.step(1, -0.5)).toBe(false);
    expect(spring.x).toBe(0);
    expect(spring.step(1, 10)).toBe(true); // a hidden tab: no overshoot, no blow-up
    expect(spring.x).toBe(1);
  });

  it('lands on a goal at once, at rest', () => {
    const spring = new Spring(0);
    spring.step(1, 0.05);
    expect(spring.place(3)).toBe(true);
    expect(spring.x).toBe(3);
    expect(spring.step(3, 0.05)).toBe(false);
    expect(spring.place(3)).toBe(false); // already there
  });
});
