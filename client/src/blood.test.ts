import { describe, expect, it } from 'vitest';
import { DIRECTIONS, axialTo3D } from './board';
import { BLOOD_DROPS, BLOOD_MS, bloodAt, bloodStainAt, type Drop } from './blood';
import { FRAME } from './frame';

// The rim cell (-2,-2), pushed NW (dir 4): the spatter starts beyond it, on the push line.
const from = axialTo3D(-2, -2);
const step = axialTo3D(...DIRECTIONS[4]!);
const dir = { x: step.x, z: step.z };
const CELL_RADIUS = 0.58; // a hex cell of spacing 1 (board.ts), circumradius 1 / sqrt(3) rounded up

const at = (ms: number, reduced = false): Drop[] => bloodAt(from, dir, ms, reduced);
const stainAt = (ms: number, reduced = false) => bloodStainAt(from, dir, ms, reduced);

describe('bloodStainAt', () => {
  it('draws no stain under reduced motion, or once the effect is over', () => {
    expect(stainAt(100, true)).toBeNull();
    expect(stainAt(BLOOD_MS)).toBeNull();
  });

  it('a stain spreads in the splash, is clearly visible, and never reaches a cell', () => {
    const grown = stainAt(300)!;
    expect(grown.radius).toBeGreaterThan(stainAt(0)!.radius);
    expect(grown.radius).toBeGreaterThanOrEqual(0.3); // a blot a player sees at a glance, not a dot
    for (const ms of [0, 150, 300, 600, BLOOD_MS - 1]) {
      const s = stainAt(ms)!;
      const gap = Math.hypot(s.x - from.x, s.z - from.z) - s.radius; // nearest edge to the rim cell centre
      expect(gap).toBeGreaterThan(CELL_RADIUS);
    }
  });

  it('fades and never brightens, and is the same for the same input', () => {
    const samples = Array.from({ length: BLOOD_MS }, (_, ms) => stainAt(ms)!);
    expect(samples[0]!.alpha).toBe(1);
    samples.forEach((s, i) => {
      if (i > 0) expect(s.alpha).toBeLessThanOrEqual(samples[i - 1]!.alpha);
    });
    expect(samples.at(-1)!.alpha).toBeGreaterThan(0);
    expect(stainAt(-16)).toEqual(stainAt(0));
    expect(stainAt(300)).toEqual(stainAt(300));
  });
});

describe('bloodAt', () => {
  it('draws nothing under reduced motion, at any time', () => {
    for (const ms of [0, 100, 400, BLOOD_MS - 1]) expect(at(ms, true)).toEqual([]);
  });

  it('draws a fixed count of drops from the first frame, and none once the effect is over', () => {
    expect(at(0)).toHaveLength(BLOOD_DROPS);
    expect(BLOOD_DROPS).toBeGreaterThanOrEqual(10); // few enough to count at a glance, large enough to read
    expect(BLOOD_DROPS).toBeLessThanOrEqual(12);
    expect(at(BLOOD_MS)).toEqual([]);
    expect(at(BLOOD_MS + 500)).toEqual([]);
  });

  it('is short, under 1 s, and ends by itself', () => {
    expect(BLOOD_MS).toBeLessThanOrEqual(1000);
  });

  it('a frame stamped before the start draws the first frame, not nothing', () => {
    expect(at(-16)).toEqual(at(0));
  });

  it('never covers a cell: every drop stays beyond the rim cell, outside its hex', () => {
    for (const ms of [0, 150, 300, 600, BLOOD_MS - 1]) {
      for (const d of at(ms)) {
        const gap = Math.hypot(d.x - from.x, d.z - from.z);
        expect(gap).toBeGreaterThanOrEqual(1 - 1e-9); // the cell centre is 1 away along the push
        expect(gap).toBeGreaterThan(CELL_RADIUS);
      }
    }
  });

  it('clears the steel frame: the stain and every drop sit beyond its outer edge', () => {
    // The frame's outer edge is FRAME.margin + FRAME.rim past the rim cell's centre line (frame.ts).
    const clear = FRAME.margin + FRAME.rim;
    const along = (x: number, z: number) => (x - from.x) * dir.x + (z - from.z) * dir.z;
    for (const ms of [0, 150, 300, 600, BLOOD_MS - 1]) {
      const s = stainAt(ms)!;
      expect(along(s.x, s.z) - s.radius).toBeGreaterThanOrEqual(clear);
      for (const d of at(ms)) expect(along(d.x, d.z)).toBeGreaterThanOrEqual(clear);
    }
  });

  it('the drops land on the void by 600 ms, as small dots that fade with the stain', () => {
    expect(at(0).every((d) => d.y > 0.3)).toBe(true); // still in the air as they leave the rim
    expect(at(600).every((d) => d.y < 0.05)).toBe(true);
  });

  it('spreads outward only: no drop flies back over the board', () => {
    for (const ms of [0, 200, 500, BLOOD_MS - 1]) {
      for (const d of at(ms)) {
        const along = (d.x - from.x) * dir.x + (d.z - from.z) * dir.z;
        expect(along).toBeGreaterThanOrEqual(1 - 1e-9); // measured from the cell centre
      }
    }
  });

  it('fades and never brightens: alpha starts at 1 and only falls to 0', () => {
    const samples = Array.from({ length: BLOOD_MS }, (_, ms) => at(ms));
    for (const [i, frame] of samples.entries()) {
      if (i === 0) expect(frame.every((d) => d.alpha === 1)).toBe(true);
      if (i > 0) frame.forEach((d, k) => expect(d.alpha).toBeLessThanOrEqual(samples[i - 1]![k]!.alpha));
    }
    expect(samples.at(-1)!.every((d) => d.alpha > 0)).toBe(true); // still there one frame before the end
  });

  it('is the same for the same input, so the e2e checks can read it', () => {
    expect(at(300)).toEqual(at(300));
  });
});
