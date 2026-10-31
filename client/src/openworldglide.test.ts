import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { animT, loopT, slowBy, GLIDE_MS, Marble, NUDGE, NUDGE_MS, HOP, hopAt, ROLL_ZOOM, SQUASH, squashAt, type Vec } from './openworldglide';

const RADIUS = 0.3;
const at = (x: number, y: number, z: number): Vec => ({ x, y, z });
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('the glide of a step (docs/specs/openworld.md section 4, #1040)', () => {
  it('lasts 120 to 160 ms, a step of the hero or a troop marble', () => {
    expect(GLIDE_MS).toBeGreaterThanOrEqual(120);
    expect(GLIDE_MS).toBeLessThanOrEqual(160);
  });

  it('starts on the old cell, is past the middle at half the time (an ease-out), and lands on the new cell exactly', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0.5, 0));
    expect(m.go(at(1, 0.5, 0), 1000, GLIDE_MS)).toBe(true);
    m.tick(1000);
    near(m.pose.x, 0);
    m.tick(1000 + GLIDE_MS / 2);
    expect(m.pose.x).toBeGreaterThan(0.5); // ease-out: 1 - (1 - 0.5)^3 = 0.875
    near(m.pose.x, 0.875);
    m.tick(1000 + GLIDE_MS);
    expect(m.pose.x).toBe(1);
    expect(m.pose.z).toBe(0);
  });

  it('keeps the height on the path: from the old cell top to the new one, on the same ease', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0.5, 0));
    m.go(at(1, 1.5, 0), 0);
    m.tick(GLIDE_MS / 2);
    near(m.pose.y, 0.5 + 0.875 * 1 + HOP); // the path, plus the hop (#1100)
    m.tick(GLIDE_MS);
    expect(m.pose.y).toBe(1.5);
  });

  it('rolls the marble in the direction of travel: its turn is the way it covers over its radius', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS);
    m.tick(GLIDE_MS);
    // one cell of travel over the radius, about the axis that rolls a sphere along +x: the turn is -z, the way a wheel turns
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), 1 / RADIUS);
    expect(m.pose.q.angleTo(expected)).toBeLessThan(1e-6);
    const top = new THREE.Vector3(0, RADIUS, 0).applyQuaternion(m.pose.q);
    expect(top.x).toBeLessThan(0); // 1 / radius is about 3.3 rad: the top has rolled past the bottom
  });

  it('rolls a step along another direction on the same way: the turn follows the travel', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(0, 0, 1), 0, GLIDE_MS);
    m.tick(GLIDE_MS / 2);
    // towards +z the wheel turns about +x, by the share of the turn the ease has covered (0.875 at half the time)
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.875 / RADIUS);
    expect(m.pose.q.angleTo(expected)).toBeLessThan(1e-6);
  });

  it('draws no turn and no squash at a far-out zoom: the glide of the place stays', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, false);
    m.tick(GLIDE_MS / 2, false);
    near(m.pose.x, 0.875);
    expect(m.pose.q.angleTo(new THREE.Quaternion())).toBe(0);
    expect(m.pose.sx).toBe(1);
    expect(m.pose.sy).toBe(1);
  });

  it('does not restart a glide to the cell it already glides to', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    expect(m.go(at(1, 0, 0), 0)).toBe(true);
    expect(m.go(at(1, 0, 0), 50)).toBe(false);
    m.tick(GLIDE_MS / 2);
    near(m.pose.x, 0.875);
  });

  it('does not glide to the cell it stands on', () => {
    const m = new Marble(RADIUS);
    m.place(at(2, 0, 0));
    expect(m.go(at(2, 0, 0), 0)).toBe(false);
    expect(m.tick(0)).toBe(false);
  });

  it('chains a held step from the place the marble has at that moment, with no snap back', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0);
    m.tick(60);
    const mid = m.pose.x;
    expect(mid).toBeGreaterThan(0);
    m.go(at(2, 0, 0), 60);
    m.tick(60);
    near(m.pose.x, mid); // the new glide starts where the marble is
    m.tick(60 + GLIDE_MS);
    expect(m.pose.x).toBe(2);
  });

  it('moves to a place of the same ground at another height without a turn: the marble rises, it does not roll', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    expect(m.go(at(0, 1, 0), 0)).toBe(true);
    m.tick(GLIDE_MS);
    expect(m.pose.y).toBe(1);
    expect(m.pose.q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });

  it('turns smoothly when the direction changes mid-glide: the next cell is reached from the place it was at', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0);
    m.tick(70);
    const before = m.pose.q.clone();
    const x = m.pose.x;
    m.go(at(1, 0, 1), 70);
    m.tick(70);
    near(m.pose.x, x);
    expect(m.pose.z).toBeCloseTo(0, 9);
    expect(m.pose.q.angleTo(before)).toBeLessThan(1e-6); // the roll goes on from where it was
    m.tick(70 + GLIDE_MS);
    near(m.pose.x, 1);
    expect(m.pose.z).toBeCloseTo(1, 9);
  });

  it('squashes on landing: round at the start, flattened just before the end, back to the round at the end', () => {
    expect(squashAt(0)).toBe(0);
    expect(squashAt(0.5)).toBe(0);
    expect(squashAt(1)).toBe(0);
    expect(squashAt(0.85)).toBeCloseTo(1, 9);
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0);
    m.tick(0.85 * GLIDE_MS);
    near(m.pose.sy, 1 - SQUASH);
    near(m.pose.sx, 1 + SQUASH / 2);
    m.tick(GLIDE_MS);
    expect(m.pose.sy).toBe(1);
    expect(m.pose.sx).toBe(1);
  });

  it('reports whether the marble moves on this tick: while it glides, and once more at its last frame', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    expect(m.tick(0)).toBe(false);
    m.go(at(1, 0, 0), 0);
    expect(m.tick(10)).toBe(true);
    expect(m.tick(GLIDE_MS)).toBe(true);
    expect(m.tick(GLIDE_MS + 10)).toBe(false);
  });

  it('stands on a cell at once when placed: no glide, no turn, the pose at the place', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0);
    m.place(at(3, 0.2, 4));
    expect(m.tick(10)).toBe(false);
    expect(m.pose.x).toBe(3);
    expect(m.pose.y).toBe(0.2);
    expect(m.pose.z).toBe(4);
    expect(m.pose.q.angleTo(new THREE.Quaternion())).toBe(0);
  });

  it('is put on a place by a push: the pose follows, and the next glide starts from it', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.put(at(2, 0, 0));
    expect(m.tick(0)).toBe(false);
    expect(m.pose.x).toBe(2);
    expect(m.go(at(2, 0, 0), 0)).toBe(false); // it stands on it already
    expect(m.go(at(3, 0, 0), 0)).toBe(true);
    m.tick(0);
    near(m.pose.x, 2);
  });
});

describe('the nudge of a blocked step (#1040)', () => {
  it('leans the marble toward the obstacle by a fifth of a cell and back, in 120 ms', () => {
    expect(NUDGE_MS).toBe(120);
    expect(NUDGE).toBe(0.2);
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.bump(at(1, 0, 0), 0);
    expect(m.tick(0)).toBe(true);
    expect(m.pose.x).toBeCloseTo(0, 9);
    m.tick(NUDGE_MS / 2);
    near(m.pose.x, NUDGE);
    m.tick(NUDGE_MS / 4);
    near(m.pose.x, NUDGE * Math.SQRT1_2);
    expect(m.tick(NUDGE_MS)).toBe(true);
    expect(m.pose.x).toBe(0);
    expect(m.tick(NUDGE_MS + 1)).toBe(false);
  });

  it('nudges on top of a glide: the marble goes on to its cell and leans on the way', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0);
    m.bump(at(0, 0, 1), 0);
    m.tick(NUDGE_MS / 2);
    expect(m.pose.z).toBeCloseTo(NUDGE, 9);
    m.tick(GLIDE_MS);
    expect(m.pose.x).toBe(1);
    expect(m.pose.z).toBeCloseTo(0, 9);
  });
});

describe('the Open world motion clock (#1107)', () => {
  it('is 0 before the start, at the start, and 1 from the end on, for each ease', () => {
    for (const e of ['out', 'in', 'in-out'] as const) {
      expect(animT(100, 50, 200, e)).toBe(0);
      expect(animT(100, 100, 200, e)).toBe(0);
      expect(animT(100, 300, 200, e)).toBe(1);
      expect(animT(100, 900, 200, e)).toBe(1);
    }
  });

  it('eases the middle: out is ahead, in is behind, in-out is past half at the half (its curve starts slow, ends fast)', () => {
    expect(animT(0, 100, 200, 'out')).toBeGreaterThan(0.5);
    expect(animT(0, 100, 200, 'in')).toBeLessThan(0.5);
    expect(animT(0, 100, 200, 'in-out')).toBeCloseTo(0.7756, 3);
    for (const e of ['out', 'in', 'in-out'] as const) {
      let last = 0;
      for (let ms = 0; ms <= 200; ms += 10) {
        const t = animT(0, ms, 200, e);
        expect(t).toBeGreaterThanOrEqual(last);
        last = t;
      }
    }
  });

  it('is 1 for a zero or negative duration', () => {
    expect(animT(100, 100, 0, 'out')).toBe(1);
    expect(animT(100, 0, -5, 'in')).toBe(1);
  });

  it('loops in [0, 1)', () => {
    expect(loopT(0, 2400)).toBe(0);
    expect(loopT(600, 2400)).toBe(0.25);
    expect(loopT(2400, 2400)).toBe(0);
    expect(loopT(2500, 2400)).toBeCloseTo(100 / 2400, 10);
    expect(loopT(-600, 2400)).toBe(0.75);
    expect(loopT(5, 0)).toBe(0);
  });

  it('reads the slow factor of window.__openworldSlow, 1 by default', () => {
    vi.stubGlobal('window', {});
    expect(slowBy()).toBe(1);
    vi.stubGlobal('window', { __openworldSlow: 10 });
    expect(slowBy()).toBe(10);
    vi.unstubAllGlobals();
  });
});

describe('the hop of a step (#1100)', () => {
  it('rises 0.08 cell at mid-step and is on the ground at both ends', () => {
    expect(HOP).toBe(0.08);
    expect(hopAt(0)).toBe(0);
    expect(hopAt(1)).toBe(0);
    expect(hopAt(0.5)).toBeCloseTo(HOP, 9);
  });

  it('lifts the drawn marble at mid-glide, lands on the cell, and does not hop far out or without a roll', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS, true, 'walk');
    m.tick(GLIDE_MS / 2);
    near(m.pose.y, HOP);
    m.tick(GLIDE_MS);
    expect(m.pose.y).toBe(0);
    const far = new Marble(RADIUS);
    far.place(at(0, 0, 0));
    far.go(at(1, 0, 0), 0, GLIDE_MS, false, 'walk');
    far.tick(GLIDE_MS / 2, false);
    expect(far.pose.y).toBe(0);
  });

  it('a delayed glide (the troop follows) stays on its old cell until its start, then lands on time', () => {
    const m = new Marble(RADIUS);
    m.place(at(0, 0, 0));
    m.go(at(1, 0, 0), 0, GLIDE_MS - 30, true, 'tap', 30);
    m.tick(30);
    expect(m.pose.x).toBe(0);
    m.tick(GLIDE_MS);
    expect(m.pose.x).toBe(1);
  });
});
