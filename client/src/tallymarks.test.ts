import { describe, expect, it } from 'vitest';
import { CELLS } from './board';
import { FRAME, frameShape, type FrameShape } from './frame';
import { MARK, tallyRow, tallySlots } from './tallymarks';

const standard = frameShape(CELLS.map(() => 0));
const apothem = (shape: FrameShape): number => Math.hypot(shape.inner[0]!.x, shape.inner[0]!.z) * (Math.sqrt(3) / 2);

describe('tallySlots (#389, world.md section 6 rule 3)', () => {
  it('1v1 and bosses: 6 slots per side, one scratched for each marble the side lost', () => {
    expect(tallySlots([0, 0])).toEqual([Array(6).fill(false), Array(6).fill(false)]);
    expect(tallySlots([0, 2])).toEqual([
      Array(6).fill(false),
      [true, true, false, false, false, false],
    ]);
    expect(tallySlots([5, 1])[0]).toEqual([true, true, true, true, true, false]);
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
});
