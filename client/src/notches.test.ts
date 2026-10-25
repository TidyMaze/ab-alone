import { describe, expect, it } from 'vitest';
import { CELLS, VANISHED } from './board';
import { FRAME, frameShape } from './frame';
import { NOTCH, notchRow } from './notches';

const ring = ([q, r]: readonly [number, number]): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const standard = frameShape(CELLS.map(() => 0));
const choir = frameShape(CELLS.map((c) => (ring(c) === 4 ? VANISHED : 0))); // radius 3
const apothem = (shape: typeof standard): number => shape.inner[1]!.z; // the near side faces +z

describe('notchRow (#356, world.md section 6 rule 4)', () => {
  it('draws nothing in the last phase: no marble count, no next threshold', () => {
    expect(notchRow(standard, [])).toBeNull();
  });

  it('puts the dark notches first, then the lit ones, then the threshold glyph, in a row', () => {
    const row = notchRow(standard, [3, 1])!;
    expect(row.notches.map((n) => n.lit)).toEqual([false, true, true, true]);
    const xs = [...row.notches.map((n) => n.x), row.glyph.x];
    xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeCloseTo(NOTCH.step));
    expect(xs[0]).toBeCloseTo(-xs[4]!); // centred
  });

  it('scratches the row along the middle of the near side of the rim, in front of the player', () => {
    const row = notchRow(standard, [4, 0])!;
    for (const p of [...row.notches, row.glyph]) expect(p.z).toBeCloseTo(apothem(standard) + FRAME.rim / 2);
  });

  it('keeps a long row on the near side, the Choir frame included', () => {
    for (const [shape, counts] of [
      [standard, [12, 4]],
      [choir, [4, 0]],
      [choir, [10, 0]],
    ] as const) {
      const row = notchRow(shape, counts)!;
      expect(row.notches).toHaveLength(counts[0] + counts[1]);
      const half = (apothem(shape) + FRAME.rim / 2) / Math.sqrt(3); // half the side, at the middle of the rim
      for (const p of [...row.notches, row.glyph]) expect(Math.abs(p.x) + NOTCH.step / 2).toBeLessThan(half);
    }
  });
});
