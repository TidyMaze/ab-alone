import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { GLIDE_MS, Marble, shareAt, slopeAt, type Vec } from './openworldglide';

// #1065: a held walk moves at a constant speed from cell to cell. Measured before the change (headless Chrome, WebGPU, 60 Hz): the
// hero covered 0.315 world units a frame at the start of a step and 0.005 at its end, seven times a second.

const RADIUS = 0.3;
const FRAME = 1000 / 60;
const PER_MS = 1 / GLIDE_MS; // a cell per GLIDE_MS
const at = (x: number, y: number, z: number): Vec => ({ x, y, z });
const closeTo = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

/** The x drawn on each 60 Hz frame of a walk of `cells` cells: the first step starts at 0, each next one at its due time. */
function walk(cells: number, roll = true): number[] {
  const m = new Marble(RADIUS);
  m.place(at(0, 0, 0));
  const xs: number[] = [];
  m.go(at(1, 0, 0), 0, GLIDE_MS, roll, 'start');
  let next = 1;
  for (let t = 0; t <= cells * GLIDE_MS; t += FRAME) {
    while (next < cells && t >= next * GLIDE_MS) {
      m.go(at(next + 1, 0, 0), next * GLIDE_MS, GLIDE_MS, roll, 'walk');
      next++;
    }
    m.tick(t, roll);
    xs.push(m.pose.x);
  }
  return xs;
}

/** A marble walking to x = 1 that is braked at `at` ms. */
function braked(from = 70): Marble {
  const m = new Marble(RADIUS);
  m.place(at(0, 0, 0));
  m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'walk');
  m.tick(from);
  m.brake(from);
  return m;
}

describe('the velocity of a step, a pure function of time (#1065)', () => {
  it('shareAt: a cubic through 0 and 1 with the slopes it is given, held at its ends', () => {
    expect(shareAt(-1, 1, 1)).toBe(0);
    expect(shareAt(0, 1, 1)).toBe(0);
    expect(shareAt(1, 1, 1)).toBe(1);
    expect(shareAt(2, 1, 1)).toBe(1);
    closeTo(shareAt(0.3, 1, 1), 0.3); // slopes of 1: a straight line, the constant speed
    closeTo(shareAt(0.5, 3, 0), 0.875); // the ease-out cubic of a tap, 1 - (1 - t)^3
    closeTo(shareAt(0.5, 0, 1), 0.375); // the start: 2 t^2 - t^3
  });

  it('slopeAt: the speed of those, in shares of the step per unit of its time', () => {
    closeTo(slopeAt(0.4, 1, 1), 1);
    closeTo(slopeAt(0, 3, 0), 3);
    closeTo(slopeAt(1, 3, 0), 0);
    closeTo(slopeAt(0, 0, 1), 0);
    closeTo(slopeAt(1, 0, 1), 1);
    closeTo(slopeAt(-1, 0, 1), 0); // held at its ends
    closeTo(slopeAt(2, 0, 1), 0);
  });
});

describe('the steady walk of the held arrows (#1065)', () => {
  it('covers the same distance on every frame once under way: under 10 % apart, a step after a step', () => {
    const xs = walk(8);
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    const steady = steps.slice(Math.ceil(GLIDE_MS / FRAME) + 1); // past the first step, which starts from rest
    expect(steady.length).toBeGreaterThan(40);
    expect((Math.max(...steady) - Math.min(...steady)) / Math.min(...steady)).toBeLessThan(0.1);
    closeTo(Math.min(...steady), PER_MS * FRAME);
  });

  it('keeps that speed at a far-out zoom, where the marble draws no roll', () => {
    const xs = walk(5, false);
    const steps = xs
      .slice(1)
      .map((x, i) => x - xs[i]!)
      .slice(10);
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.1);
  });

  it('starts from rest and reaches the walking speed at the end of its first step', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'start');
    m.tick(1);
    expect(m.pose.x).toBeLessThan(5e-4); // no jump at the start
    m.tick(GLIDE_MS - 1);
    const before = m.pose.x;
    m.tick(GLIDE_MS);
    closeTo(m.pose.x - before, PER_MS, 3);
    expect(m.pose.x).toBe(1);
  });

  it('chains a walk step on the end of the one before with the same speed and no stop', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'start');
    m.go(at(2, 0, 0), GLIDE_MS, GLIDE_MS, true, 'walk');
    m.tick(GLIDE_MS + 1);
    closeTo(m.pose.x - 1, PER_MS, 3);
    m.tick(GLIDE_MS * 2);
    expect(m.pose.x).toBe(2);
  });

  it('does not squash while walking: only the landing of a stop squashes', () => {
    for (const pace of ['start', 'walk'] as const) {
      const m = new Marble(RADIUS);
      m.place(at(0, 0, 0));
      m.go(at(1, 0, 0), 0, GLIDE_MS, true, pace);
      m.tick(0.85 * GLIDE_MS);
      expect([m.pose.sx, m.pose.sy]).toEqual([1, 1]);
    }
  });
});

describe('the stop of a walk, on release (#1065)', () => {
  it('goes on from its place, its turn and its speed, with no jump', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'walk');
    m.tick(70);
    const x = m.pose.x;
    const turn = m.pose.q.clone();
    m.brake(70);
    m.tick(70);
    closeTo(m.pose.x, x);
    expect(m.pose.q.angleTo(turn)).toBeLessThan(1e-6);
    m.tick(71);
    closeTo(m.pose.x - x, PER_MS, 3);
  });

  it('slows to nothing, lands on its cell at the time the step was due, and never goes back or past it', () => {
    const m = braked();
    let last = m.pose.x;
    for (let t = 70; t < GLIDE_MS; t += 2) {
      m.tick(t);
      expect(m.pose.x).toBeGreaterThanOrEqual(last);
      expect(m.pose.x).toBeLessThanOrEqual(1);
      last = m.pose.x;
    }
    m.tick(GLIDE_MS - 1);
    const before = m.pose.x;
    m.tick(GLIDE_MS);
    expect(m.pose.x - before).toBeLessThan(5e-4); // at rest
    expect(m.pose.x).toBe(1);
  });

  it('keeps the ease-out of a single tap: a first step let go at once glides exactly as a tap does', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'start');
    m.brake(0);
    m.tick(GLIDE_MS / 2);
    closeTo(m.pose.x, 0.875);
    m.tick(0.85 * GLIDE_MS);
    expect(m.pose.sy).toBeLessThan(1); // and squashes on landing, as it did
    m.tick(GLIDE_MS);
    expect(m.pose.x).toBe(1);
  });

  it('squashes on landing: the real stop', () => {
    const m = braked();
    m.tick(70 + 0.85 * (GLIDE_MS - 70));
    expect(m.pose.sy).toBeLessThan(1);
    m.tick(GLIDE_MS);
    expect(m.pose.sy).toBe(1);
  });

  it('brakes nothing when the marble stands, when the glide is a tap, or when it has landed', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.brake(0);
    expect(m.tick(0)).toBe(false);
    m.go(at(1, 0, 0), 0);
    m.brake(50); // a tap already eases out
    m.tick(60);
    closeTo(m.pose.x, 1 - (1 - 60 / GLIDE_MS) ** 3);
    m.go(at(2, 0, 0), 200, GLIDE_MS, true, 'walk');
    m.tick(200 + GLIDE_MS);
    m.brake(200 + GLIDE_MS); // landed at this very time
    expect(m.pose.x).toBe(2);
    expect(m.tick(200 + GLIDE_MS + 5)).toBe(false);
  });

  it('brakes a glide that has just landed on the same tick: nothing is left to slow', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'walk');
    m.brake(GLIDE_MS + 10); // later than its end
    m.tick(GLIDE_MS);
    expect(m.pose.x).toBe(1);
  });

  it('brakes in the far-out view too: no turn drawn, and a lean on top is left alone', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, false, 'walk');
    m.bump(at(0, 0, 1), 0);
    m.tick(60, false);
    m.brake(60, false);
    m.tick(100, false);
    expect(m.pose.q.angleTo(new THREE.Quaternion())).toBe(0);
    expect(m.pose.z).toBeGreaterThan(0); // the lean goes on
    m.tick(GLIDE_MS, false);
    expect(m.pose.x).toBe(1);
  });
});
