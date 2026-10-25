import { describe, expect, it } from 'vitest';
import { CELLS, VANISHED } from './board';
import { FRAME, frameShape, type FrameShape } from './frame';
import { MARK, tallyRow, tallySlots } from './tallymarks';

const ring = ([q, r]: readonly [number, number]): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const standard = frameShape(CELLS.map(() => 0));
const choir = frameShape(CELLS.map((c) => (ring(c) === 4 ? VANISHED : 0))); // radius 3
const apothem = (shape: FrameShape): number => Math.hypot(shape.inner[0]!.x, shape.inner[0]!.z) * (Math.sqrt(3) / 2);

describe('tallySlots (#389, world.md section 6 rule 3)', () => {
  it('1v1 and bosses: 6 slots per side, one scratched for each marble the side lost', () => {
    expect(tallySlots([0, 0], [14, 14], 'lost')).toEqual([Array(6).fill(false), Array(6).fill(false)]);
    expect(tallySlots([0, 2], [14, 12], 'lost')).toEqual([
      Array(6).fill(false),
      [true, true, false, false, false, false],
    ]);
    expect(tallySlots([5, 1], [9, 13], 'lost')[0]).toEqual([true, true, true, true, true, false]);
  });

  it('The Choir: one notch per marble a side had, lit while it is on the board, dark once lost', () => {
    expect(tallySlots([0, 0], [10, 12], 'left')).toEqual([Array(10).fill(true), Array(12).fill(true)]);
    expect(tallySlots([3, 1], [7, 11], 'left')).toEqual([
      [...Array(7).fill(true), ...Array(3).fill(false)],
      [...Array(11).fill(true), false],
    ]);
  });
});

describe('tallyRow (#389)', () => {
  const six = Array(6).fill(false);

  it('scratches side 1 on the near right side of the rim (+z, its end), side 2 on the far right side', () => {
    for (const side of [1, 2] as const) {
      const row = tallyRow(standard, side, six);
      expect(row).toHaveLength(6);
      const normal = (side === 1 ? 30 : -30) * (Math.PI / 180);
      for (const m of row) {
        expect(m.x * Math.cos(normal) + m.z * Math.sin(normal)).toBeCloseTo(apothem(standard) + FRAME.rim / 2); // the rim's middle
        expect(Math.sin(m.angle)).toBeCloseTo(Math.cos(normal)); // each mark runs across the rim
        expect(Math.cos(m.angle)).toBeCloseTo(Math.sin(normal));
        expect(Math.sign(m.z)).toBe(side === 1 ? 1 : -1);
      }
    }
  });

  it('runs from the corner on the x axis, MARK.step apart, centred on the side, in the slot order', () => {
    const slots = [true, true, false, false, false, false];
    const row = tallyRow(standard, 1, slots);
    expect(row.map((m) => m.marked)).toEqual(slots);
    row.slice(1).forEach((m, i) => expect(Math.hypot(m.x - row[i]!.x, m.z - row[i]!.z)).toBeCloseTo(MARK.step));
    const corner = standard.inner[0]!;
    const dist = (m: { x: number; z: number }) => Math.hypot(m.x - corner.x, m.z - corner.z);
    expect(dist(row[0]!)).toBeLessThan(dist(row[5]!));
    const mid = { x: (row[0]!.x + row[5]!.x) / 2, z: (row[0]!.z + row[5]!.z) / 2 };
    const d = apothem(standard) + FRAME.rim / 2; // the middle of the side, on the middle of the rim
    expect(mid.x).toBeCloseTo(d * Math.cos(Math.PI / 6));
    expect(mid.z).toBeCloseTo(d * Math.sin(Math.PI / 6));
  });

  it('keeps the longest row of The Choir (12 notches) on its side, clear of the corners', () => {
    const half = (apothem(choir) + FRAME.rim / 2) / Math.sqrt(3); // half the side, at the middle of the rim
    for (const side of [1, 2] as const) {
      const row = tallyRow(choir, side, Array(12).fill(true));
      const ends = [row[0]!, row[11]!];
      const mid = { x: (ends[0].x + ends[1].x) / 2, z: (ends[0].z + ends[1].z) / 2 };
      for (const m of ends) expect(Math.hypot(m.x - mid.x, m.z - mid.z) + MARK.step / 2).toBeLessThan(half);
    }
  });
});
